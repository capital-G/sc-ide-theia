import { injectable } from "@theia/core/shared/inversify";
import { BackendApplicationContribution } from "@theia/core/lib/node";
import { InterpreterState, SC_CLASS_REGEX, ScClient, ScService } from "../common/protocol";
import { EVALUATE, RECOMPILE, SILENT, SclangProcess } from "./sclang-process";
import OSC from "osc-js";
import { SclangUdp } from "./sclang-udp";

import * as path from "path";
import { readFile } from "fs/promises";

@injectable()
export class ScServiceImpl implements ScService, BackendApplicationContribution {
    restartInterpreter(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    protected process: SclangProcess | undefined;
    protected client: ScClient | undefined;
    protected state: InterpreterState = { kind: "stopped" };
    
    /** callback for compilation done */
    protected onCompileDone(): void {
        if (this.udpPort === undefined) {return;}
        this.process?.write(`~port = ${this.udpPort};${this.bootstrapCode}`, SILENT);
    }

    /** autocomplete stuff */
    protected nextId = 0;
    protected readonly pending = new Map<number, { resolve(v: string[]): void; timer: NodeJS.Timeout }>();
    protected udpSocket: SclangUdp | undefined;
    protected udpPort: number | undefined;
    protected bootstrapCode: string = "";

    async initialize(): Promise<void> {
        this.udpSocket = new SclangUdp(msg => this.onOsc(msg));
        this.udpPort = await this.udpSocket.start();

        const file = process.env.SC_IDE_BOOTSTRAP ?? path.join(__dirname, 'sc', 'bootstrap.scd');
        this.bootstrapCode = await readFile(file, 'utf-8');
    }

    setClient(client: ScClient | undefined): void {
        this.client = client;
    }
    
    getClient(): ScClient | undefined {
        return this.client;
    }

    async startInterpreter(): Promise<void> {
            if(this.process) {
                console.log("Interpreter already spawned - ignoring request");
                return;
            }
            this.process = new SclangProcess(
                {
                    sclangPath: "/Applications/SuperCollider-3.14.1.app/Contents/MacOS/sclang",
                    ideName: "theia"
                },
                chunk => this.onChunk(chunk),
                code => this.onProcessExit(code)
            );
            this.process.start();
            const pid = this.process.pid;
            if (pid === undefined) {
                // error path should handle this
                return;
            }
            this.setState({ kind: 'starting', pid });
    }

    /**
     * checks output if it contains state information of the interpreter
     */
    protected onChunk(chunk: string): void {
        if (this.state.kind !== 'stopped') {
            const pid = this.state.pid;
            const channelUp = this.state.kind === 'running' ? this.state.channelUp : false;
            if (chunk.includes("compiling class library")) {
                this.setState({ kind: 'starting', pid });
            }
            if (chunk.includes("compile done\n")) {
                this.setState({ kind: 'running', pid, compiled: true, channelUp });
                this.onCompileDone();
            }
        }
        this.client?.onPost(chunk);
    }

    protected onProcessExit(code: number | null): void {
        this.process = undefined;
        for (const {resolve, timer} of this.pending.values()) {
            clearTimeout(timer);
            resolve([]);
        }
        this.pending.clear();
        this.setState({ kind: 'stopped', exitCode: code ?? undefined });
    }

    async evaluate(code: string, silent?: boolean): Promise<void> {
        this.process?.write(code, silent ? SILENT : EVALUATE);
    }

    protected setState(state: InterpreterState): void {
        this.state = state;
        this.client?.onInterpreterStateChanged(state);
    }

    
    async stopInterpreter(): Promise<void> {
        
    }

    async recompile(): Promise<void> {
        if(this.state.kind == 'running') {
            this.setState({ ...this.state, compiled: false });
        }
        this.process?.write("", RECOMPILE);
    }

    async send(selector: string, data: unknown): Promise<void> {
        
    }

    async query(selector: string, arg: string): Promise<string[]> {
        // mockup for now...
        if (this.state.kind !== "running" || !this.state.compiled) { return []; }
        // double check - but we don't trust ourselves ;)
        if(!SC_CLASS_REGEX.test(arg)) { return []; }

        const id = ++this.nextId;
        return new Promise<string[]>(resolve => {
            const timer = setTimeout(() => {this.pending.delete(id); resolve([]);}, 500);
            this.pending.set(id, {resolve, timer });
            this.process?.write(`~hello.(${id}, \\${selector}, "${arg}")`, SILENT);
        })
    }

    protected onOsc(msg: OSC.Message): void {
        // once we got a osc message, we are connected for sure :)
        if(this.state.kind === "running" && !this.state.channelUp) {
            this.setState({ ...this.state, channelUp: true });
        }

        const [id, ...args] = msg.args;
        if (typeof(id) !== 'number' ) { return; }
        const p = this.pending.get(id);
        // we already timed out in that case
        if(!p) { return; }
        this.pending.delete(id);
        clearTimeout(p.timer);
        p.resolve(args.filter((a): a is string => typeof a === 'string'))

    }

    async interpreterState(): Promise<InterpreterState> {
        return this.state;
    }

    resolveSclangPath(): Promise<string | undefined> {
        return new Promise(() => undefined);
    }

    onStop(): void {
        this.dispose();
    }

    dispose(): void {
        this.process?.kill();
        this.process = undefined;
    }
}
