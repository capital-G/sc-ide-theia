import { Emitter, Event } from "@theia/core";
import {
    decodeScOsc,
    SclangRuntime,
    ScReply,
    ScTheiaMessage,
} from "../common/sc-service-core";
import { importGlue } from "./tools";

export const SC_WASM_BASE_URL = "/sc";

interface SclangModule {
    bootInterpreter(): void;
    runCode(code: string): void;
    runCodeSilent(code: string): void;
    sendOsc(bytes: Uint8Array): void;
    printCallback: (line: string) => void;
    printErrCallback: (line: string) => void;
    onIdeSend: (message: Uint8Array) => void;
    onOsc: (msg: Uint8Array) => void;
}

type SclangFactory = (cfg: {
    locateFile(path: string): string;
}) => Promise<SclangModule>;

export class SclangWasmRuntime implements SclangRuntime {
    protected module: SclangModule | undefined;

    protected readonly postEmitter = new Emitter<string>();
    readonly onPost: Event<string> = this.postEmitter.event;

    protected readonly replyEmitter = new Emitter<ScReply>();
    readonly onReply: Event<ScReply> = this.replyEmitter.event;

    protected readonly langMessageEmitter = new Emitter<ScTheiaMessage>();
    readonly onLangMessage: Event<ScTheiaMessage> =
        this.langMessageEmitter.event;

    protected readonly exitEmitter = new Emitter<number | null>();
    readonly onExit: Event<number | null> = this.exitEmitter.event;

    protected readonly compiledEmitter = new Emitter<void>();
    readonly onCompiled: Event<void> = this.compiledEmitter.event;

    constructor(
        protected readonly onLangOsc: (bytes: Uint8Array) => void,
        protected readonly baseUrl: string = SC_WASM_BASE_URL,
    ) {}

    async start(): Promise<void> {
        if (this.module) {
            return;
        }

        const url = `${this.baseUrl}/sclang.js`;
        const { default: factory } = await importGlue<SclangFactory>(url);

        const module = await factory({
            locateFile: (path) => `${this.baseUrl}/${path}`,
        });

        module.printCallback = (line) => this.onLine(line);
        module.printErrCallback = (line) => this.onLine(line);

        module.onIdeSend = (bytes) => {
            const decoded = decodeScOsc(new Uint8Array(bytes));
            if (decoded.kind === "reply") {
                this.replyEmitter.fire(decoded.reply);
            } else {
                this.langMessageEmitter.fire(decoded.message);
            }
        };

        module.onOsc = (bytes) => this.onLangOsc(new Uint8Array(bytes));
        this.module = module;

        module.bootInterpreter();
    }

    protected onLine(line: string): void {
        this.postEmitter.fire(`${line}\n`);
        if (line.includes("compile done")) {
            this.compiledEmitter.fire();
        }
    }

    kill(): void {
        throw new Error("Method not implemented.");
    }

    evaluate(code: string, silent: boolean): void {
        if (!this.module) {
            return;
        }
        if (silent) {
            this.module.runCodeSilent(code);
        } else {
            this.module.runCode(code);
        }
    }

    recompile(): void {
        this.evaluate("thisProcess.recompile;", false);
    }

    get bootstrapPrologue(): string {
        return `~theiaEmit = {|selector ...rows| JS.ideSend(([selector] ++ rows).asRawOSC)};\n`;
    }

    readonly pid = undefined;

    sendOsc(bytes: Uint8Array): void {
        this.module?.sendOsc(bytes);
    }
}
