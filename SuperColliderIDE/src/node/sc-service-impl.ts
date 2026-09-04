import { injectable } from "@theia/core/shared/inversify";
import { BackendApplicationContribution } from "@theia/core/lib/node";
import { InterpreterState, QuerySelector, SC_QUERY_LIMIT, ScArg, ScClient, ScMethodRef, ScMethodSide, ScService } from "../common/protocol";
import { EVALUATE, RECOMPILE, SILENT, SclangProcess } from "./sclang-process";
import OSC from "osc-js";
import { SclangUdp } from "./sclang-udp";
import { SC_BOOTSTRAP } from "../common/sc-bootstrap";
import { access, constants } from "fs/promises";

const SC_RESOLVE_TIMEOUT_MS = 500;

/** first match wins - SC_LANG_PATH env for overwriting */
const SCLANG_PATH_CANDIDATES = [
    "/Applications/SuperCollider-3.14.1.app/Contents/MacOS/sclang",
    "/Applications/SuperCollider.app/Contents/MacOS/sclang",
]

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
        this.process?.write(`~port = ${this.udpPort};~theiaQueryLimit=${SC_QUERY_LIMIT};${SC_BOOTSTRAP}`, SILENT);
    }

    /** autocomplete stuff */
    protected nextId = 0;
    protected readonly pending = new Map<number, { resolve(v: string[] | undefined): void; timer: NodeJS.Timeout }>();
    protected udpSocket: SclangUdp | undefined;
    protected udpPort: number | undefined;

    async initialize(): Promise<void> {
        this.udpSocket = new SclangUdp(msg => this.onOsc(msg));
        this.udpPort = await this.udpSocket.start();
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
            const sclangPath = await this.resolveSclangPath();
            if(!sclangPath) {
                this.client?.onPost("[sclang] binary not found!\n");
                return;
            }
            this.process = new SclangProcess(
                {
                    sclangPath: sclangPath,
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
            resolve(undefined);
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

    // check if args are rather primitives string w/o any escape
    private static readonly SAFE_ARG = /^[A-Za-z0-9_]*$/;

    private async query(selector: QuerySelector, ...args: string[]): Promise<string[] | undefined> {
        if (this.state.kind !== "running" || !this.state.compiled) { return undefined; }
        if(!args.every(a => ScServiceImpl.SAFE_ARG.test(a))) { return undefined; }

        const id = ++this.nextId;
        return new Promise<string[] | undefined>(resolve => {
            const timer = setTimeout(() => {this.pending.delete(id); resolve(undefined);}, SC_RESOLVE_TIMEOUT_MS);
            this.pending.set(id, { resolve, timer });
            this.process?.write(`~theiaIDE.(${id}, \\${selector}, "${args.join('", "')}")`, SILENT);
        })
    }

    async queryClass(text: string): Promise<string[]> {
        return await this.query(QuerySelector.CLASS_LOOKUP, text) ?? [];
    }

    async queryMethod(prefix: string, receiverClass?: string, side?: ScMethodSide): Promise<ScMethodRef[]> {
        const rows = await this.query(QuerySelector.METHOD_LOOKUP, prefix, receiverClass ?? "", side ?? "");
        // need to split the rows now - which are tab separated
        return rows?.flatMap(row => {
            const [name, ownerClass, kind] = row.split("\t");
            if (!name || !ownerClass || !kind ) {return []; }
            return [{
                name,
                ownerClass,
                isClassMethod: kind == "c",
            }]
        }) ?? []
    }

    async queryArgs(ref: ScMethodRef): Promise<ScArg[] | undefined> {
        const rows = await this.query(
            QuerySelector.ARGS_LOOKUP,
            ref.name,
            ref.ownerClass,
            ref.isClassMethod ? "class" : "instance"
        );
        if(!rows) { return undefined; }
    
        return rows.map(row => {
            const eq = row.indexOf("=");
            return eq < 0 ? {name: row } : { name: row.slice(0, eq), default: row.slice(eq+1)};
        });
    }

    async queryEnvClass(name: string): Promise<string | undefined> {
        const rows = await this.query(QuerySelector.ENV_CLASS_LOOKUP, name);
        return rows?.[0];
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

    async resolveSclangPath(): Promise<string | undefined> {
        const envPath = process.env.SC_LANG_PATH;
        if (envPath) { return envPath; }
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

    onStop(): void {
        this.dispose();
    }

    dispose(): void {
        this.process?.kill();
        this.process = undefined;
        this.udpSocket?.dispose();
        this.udpSocket = undefined;
    }
}
