import { Event, Emitter } from "@theia/core";
import { SclangRuntime, ScReply } from "../common/sc-service-core";
import { EVALUATE, RECOMPILE, SclangProcess, SILENT } from "./sclang-process";
import { SclangUdp } from "./sclang-udp";
import { SC_QUERY_LIMIT } from "../common/protocol";
import { access, constants } from "fs/promises";
import OSC from "osc-js";

/** first match wins - SC_LANG_PATH env for overwriting */
const SCLANG_PATH_CANDIDATES = [
    "/Applications/SuperCollider-3.14.1.app/Contents/MacOS/sclang",
    "/Applications/SuperCollider.app/Contents/MacOS/sclang",
];

export class SclangNodeRuntime implements SclangRuntime {
    protected process: SclangProcess | undefined;
    protected udp: SclangUdp | undefined;
    protected port: number | undefined;

    protected readonly postEmitter = new Emitter<string>();
    readonly onPost: Event<string> = this.postEmitter.event;

    protected readonly replyEmitter = new Emitter<ScReply>();
    readonly onReply: Event<ScReply> = this.replyEmitter.event;

    protected readonly exitEmitter = new Emitter<number | null>();
    readonly onExit: Event<number | null> = this.exitEmitter.event;

    protected readonly compiledEmitter = new Emitter<void>();
    readonly onCompiled: Event<void> = this.compiledEmitter.event;

    protected onChunk(chunk: string): void {
        this.postEmitter.fire(chunk);
        // @todo remove this check for every chunk...
        if (chunk.includes("compile done\n")) {
            this.compiledEmitter.fire();
        }
    }

    get pid(): number | undefined {
        return this.process?.pid;
    }

    get bootstrapPrologue(): string {
        return (
            `~theiaLimit = ${SC_QUERY_LIMIT};` +
            `~theiaAddr = NetAddr("127.0.0.1", ${this.port});` +
            `~theiaEmit = {|id, rows| ~theiaAddr.sendMsg("/complete", id, *rows)};`
        );
    }

    async start(): Promise<void> {
        const sclangPath = await this.resolveSclangPath();
        if (!sclangPath) {
            this.postEmitter?.fire("Could not find sclang binary!\n");
            this.exitEmitter.fire(null);
            return;
        }
        // the socket is allowed to outlive since we only run a single interpreter
        if (!this.udp) {
            this.udp = new SclangUdp((msg) => this.onOsc(msg));
            this.port = await this.udp.start();
        }

        this.process = new SclangProcess(
            {
                sclangPath: sclangPath,
                ideName: "theia",
            },
            (chunk) => this.onChunk(chunk),
            (code) => {
                this.process = undefined;
                this.exitEmitter.fire(code);
            },
        );
        this.process.start();
    }

    kill(): void {
        this.process?.kill();
    }

    evaluate(code: string, silent: boolean): void {
        this.process?.write(code, silent ? SILENT : EVALUATE);
    }

    recompile(): void {
        this.process?.write("", RECOMPILE);
    }

    protected onOsc(msg: OSC.Message): void {
        const [id, ...args] = msg.args;
        if (typeof id !== "number") {
            return;
        }
        this.replyEmitter.fire({
            id,
            rows: args.filter((a): a is string => typeof a === "string"),
        });
    }

    async resolveSclangPath(): Promise<string | undefined> {
        const envPath = process.env.SC_LANG_PATH;
        if (envPath) {
            return envPath;
        }
        for (const pathCandidate of SCLANG_PATH_CANDIDATES) {
            try {
                await access(pathCandidate, constants.F_OK);
                return pathCandidate;
            } catch {
                // try next one ;)
            }
        }
        return undefined;
    }

    dispose(): void {
        this.process?.kill();
        this.process = undefined;
        this.udp?.dispose();
        this.udp = undefined;
        this.postEmitter.dispose();
        this.replyEmitter.dispose();
        this.exitEmitter.dispose();
        this.compiledEmitter.dispose();
    }
}
