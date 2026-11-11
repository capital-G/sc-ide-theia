import { Event, Emitter } from "@theia/core";
import {
    decodeScOsc,
    SclangRuntime,
    ScReply,
    ScTheiaMessage,
} from "../common/sc-service-core";
import { EVALUATE, RECOMPILE, SclangProcess, SILENT } from "./sclang-process";
import { SclangUdp } from "./sclang-udp";
import {
    SC_QUERY_LIMIT,
    SC_REPLY_ADDRESS as SC_REPLY_SELECTOR,
} from "../common/protocol";
import OSC from "osc-js";
import { ScLaunchOptions } from "../common/sc-language-config";
import {
    currentEnvironment,
    resolveSclang,
    scsynthProgramCode,
} from "./sc-executables";

export class SclangNodeRuntime implements SclangRuntime {
    protected process: SclangProcess | undefined;
    protected udp: SclangUdp | undefined;
    protected port: number | undefined;
    protected launchOptions: ScLaunchOptions = {};
    protected readonly environment = currentEnvironment();

    protected readonly postEmitter = new Emitter<string>();
    readonly onPost: Event<string> = this.postEmitter.event;

    protected readonly replyEmitter = new Emitter<ScReply>();
    readonly onReply: Event<ScReply> = this.replyEmitter.event;

    protected readonly exitEmitter = new Emitter<number | null>();
    readonly onExit: Event<number | null> = this.exitEmitter.event;

    protected readonly compiledEmitter = new Emitter<void>();
    readonly onCompiled: Event<void> = this.compiledEmitter.event;

    protected readonly langMessageEmitter = new Emitter<ScTheiaMessage>();
    readonly onLangMessage: Event<ScTheiaMessage> =
        this.langMessageEmitter.event;

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

    /** applies on the next start */
    setLaunchOptions(options: ScLaunchOptions): void {
        this.launchOptions = options;
    }

    get bootstrapPrologue(): string {
        const scsynth = this.launchOptions.scsynthPath;
        return (
            `~theiaLimit = ${SC_QUERY_LIMIT};` +
            `~theiaAddr = NetAddr("127.0.0.1", ${this.port});` +
            `~theiaEmit = {|selector ...rows| ~theiaAddr.sendMsg(selector, *rows)};` +
            (scsynth
                ? scsynthProgramCode(scsynth, this.environment.platform)
                : "")
        );
    }

    async start(): Promise<void> {
        const sclangPath = await this.resolveSclangPath();
        if (!sclangPath) {
            this.postEmitter?.fire(
                "Could not find sclang, choose the SuperCollider installation in the language settings or set SC_LANG_PATH.\n",
            );
            this.exitEmitter.fire(null);
            return;
        }
        // the socket is allowed to outlive since we only run a single interpreter
        if (!this.udp) {
            this.udp = new SclangUdp((bytes) => {
                const decoded = decodeScOsc(bytes);
                if (decoded.kind === "reply") {
                    this.replyEmitter.fire(decoded.reply);
                } else {
                    this.langMessageEmitter.fire(decoded.message);
                }
            });
            this.port = await this.udp.start();
        }

        this.process = new SclangProcess(
            {
                sclangPath: sclangPath,
                ideName: "theia",
                cwd: this.launchOptions.cwd,
                arguments: this.launchOptions.configFile
                    ? ["-l", this.launchOptions.configFile]
                    : [],
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
        if (msg.address === SC_REPLY_SELECTOR) {
            const [rawId, ...replyArgs] = msg.args;
            const id = Number(rawId);
            this.replyEmitter.fire({
                id,
                rows: replyArgs.filter(
                    (a): a is string => typeof a === "string",
                ),
            });
        } else {
            this.langMessageEmitter.fire({
                selector: msg.address,
                payload: msg.args,
            });
        }
    }

    resolveSclangPath(): Promise<string | undefined> {
        return resolveSclang(this.environment, this.launchOptions);
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
