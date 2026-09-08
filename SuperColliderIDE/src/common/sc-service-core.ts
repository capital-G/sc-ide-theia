import { Emitter, Event } from "@theia/core";
import {
    InterpreterState,
    QuerySelector,
    ScArg,
    ScMethodRef,
    ScMethodSide,
} from "./protocol";
import { SC_BOOTSTRAP } from "./sc-bootstrap";

export const SC_RESOLVE_TIMEOUT_MS = 500;

/** Only used to reply to requests from theia */
export interface ScReply {
    id: number;
    rows: string[];
}

/* Arbitrary messages send to `~theiaEmit` - replies are filtered out */
export interface ScTheiaMessage {
    selector: string;
    payload: any[];
}

export interface SclangRuntime {
    start(): Promise<void>;
    kill(): void;

    /**
     * Runs code in sclang.
     *
     * @param code Code to run
     * @param silent if true, this will not yield to stdout.
     * In node/local it uses an ascii sign to indicate a silent evaluation.
     * In wasm this uses `runCodeSilent` w/ the `onIdeReply` callback.
     */
    evaluate(code: string, silent: boolean): void;
    recompile(): void;
    /** Hardcoded variables for the bootstrap script, e.g. ~port */
    readonly bootstrapPrologue: string;

    /** must emit completed bytes of strings, otherwise it can corrupt the post window */
    readonly onPost: Event<string>;
    readonly onReply: Event<ScReply>;
    readonly onLangMessage: Event<ScTheiaMessage>;
    readonly onExit: Event<number | null>;
    readonly onCompiled: Event<void>;
    /** only applicabale to desktop version */
    readonly pid?: number;
}

export class ScServiceCore {
    protected state: InterpreterState = { kind: "stopped" };

    /** used as a counter to call into language, the reply is marked w/ this id */
    protected nextId = 0;
    /** dict of all outstanding promises for querying the language */
    protected readonly pending = new Map<
        number,
        {
            resolve(v: string[] | undefined): void;
            timer: ReturnType<typeof setTimeout>;
        }
    >();

    protected readonly postEmitter = new Emitter<string>();
    readonly onPost: Event<string> = this.postEmitter.event;

    protected readonly stateEmitter = new Emitter<InterpreterState>();
    readonly onStateChanged: Event<InterpreterState> = this.stateEmitter.event;

    protected readonly langMessageEmitter = new Emitter<ScTheiaMessage>();
    readonly onLangMessage: Event<ScTheiaMessage> =
        this.langMessageEmitter.event;

    constructor(protected readonly runtime: SclangRuntime) {
        this.runtime.onPost((chunk) => this.postEmitter.fire(chunk));
        this.runtime.onReply((reply) => this.onReply(reply));
        this.runtime.onLangMessage((msg) => this.langMessageEmitter.fire(msg));
        this.runtime.onExit((code) => this.onExit(code));
        this.runtime.onCompiled(() => this.markCompiled());
    }

    interpreterState(): InterpreterState {
        return this.state;
    }

    protected setState(state: InterpreterState): void {
        this.state = state;
        this.stateEmitter.fire(state);
    }

    async start(): Promise<void> {
        if (this.state.kind !== "stopped") {
            return;
        }
        await this.runtime.start();
        this.setState({
            kind: "starting",
            pid: this.runtime.pid,
        });
    }

    async stop(): Promise<void> {
        this.runtime.kill();
    }

    async restart(): Promise<void> {
        if (this.state.kind !== "stopped") {
            await new Promise<void>((resolve) => {
                // we kill async, so resolve via state event
                const sub = this.onStateChanged((state) => {
                    if (state.kind === "stopped") {
                        sub.dispose();
                        resolve();
                    }
                });
                const guard = setTimeout(() => {
                    sub.dispose();
                    resolve();
                }, 2000);
                this.onStateChanged(() => clearTimeout(guard));
                this.runtime.kill();
            });
        }
        await this.start();
    }

    async recompile(): Promise<void> {
        if (this.state.kind === "running") {
            this.setState({ ...this.state, compiled: false });
        }
        this.runtime.recompile();
    }

    evaluate(code: string, silent = false): void {
        this.runtime.evaluate(code, silent);
    }

    protected markCompiled(): void {
        if (this.state.kind === "stopped") {
            return;
        }
        if (this.state.kind === "running" && this.state.compiled) {
            return;
        }
        const channelUp =
            this.state.kind === "running" ? this.state.channelUp : false;
        this.setState({
            kind: "running",
            pid: this.runtime.pid,
            compiled: true,
            channelUp: channelUp,
        });
        this.runtime.evaluate(
            `${this.runtime.bootstrapPrologue}${SC_BOOTSTRAP}`,
            true,
        );
    }

    protected onReply(reply: ScReply) {
        if (this.state.kind === "running" && !this.state.channelUp) {
            this.setState({ ...this.state, channelUp: true });
        }
        const p = this.pending.get(reply.id);
        // we may already timed out
        if (!p) {
            return;
        }
        this.pending.delete(reply.id);
        clearTimeout(p.timer);
        p.resolve(reply.rows);
    }

    protected onExit(code: number | null): void {
        // cancel all promises
        for (const { resolve, timer } of this.pending.values()) {
            clearTimeout(timer);
            resolve(undefined);
        }
        this.pending.clear();
        this.setState({
            kind: "stopped",
            exitCode: code ?? undefined,
        });
    }

    // protect such that the query payload does not terminate a string
    private static readonly SAFE_ARG = /^[A-Za-z0-9_]*$/;

    async query(
        selector: QuerySelector,
        ...args: string[]
    ): Promise<string[] | undefined> {
        if (this.state.kind !== "running" || !this.state.compiled) {
            return undefined;
        }
        if (!args.every((a) => ScServiceCore.SAFE_ARG.test(a))) {
            return undefined;
        }

        const id = ++this.nextId;
        return new Promise<string[] | undefined>((resolve) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                resolve(undefined);
            }, SC_RESOLVE_TIMEOUT_MS);
            this.pending.set(id, { resolve, timer });
            this.runtime.evaluate(
                `~theiaIDE.(${id}, \\${selector}, "${args.join('", "')}")`,
                true,
            );
        });
    }

    async queryClass(text: string): Promise<string[]> {
        return (await this.query(QuerySelector.CLASS_LOOKUP, text)) ?? [];
    }

    async queryMethod(
        prefix: string,
        receiverClass?: string,
        side?: ScMethodSide,
    ): Promise<ScMethodRef[]> {
        return decodeMethodRows(
            await this.query(
                QuerySelector.METHOD_LOOKUP,
                prefix,
                receiverClass ?? "",
                side ?? "",
            ),
        );
    }

    async queryArgs(ref: ScMethodRef): Promise<ScArg[] | undefined> {
        return decodeArgRows(
            await this.query(
                QuerySelector.ARGS_LOOKUP,
                ref.name,
                ref.ownerClass,
                ref.isClassMethod ? "class" : "instance",
            ),
        );
    }

    async queryEnvClass(name: string): Promise<string | undefined> {
        return (await this.query(QuerySelector.ENV_CLASS_LOOKUP, name))?.[0];
    }

    dispose(): void {
        this.runtime.kill();
        this.postEmitter.dispose();
        this.stateEmitter.dispose();
        this.langMessageEmitter.dispose();
    }
}

// maps to name\townerClass\tc/i
function decodeMethodRows(rows: string[] | undefined): ScMethodRef[] {
    return (
        rows?.flatMap((row) => {
            const [name, ownerClass, kind] = row.split("\t");
            if (!name || !ownerClass || !kind) {
                return [];
            }
            return {
                name,
                ownerClass,
                isClassMethod: kind === "c",
            };
        }) ?? []
    );
}

// maps to `name` or `name=default`
export function decodeArgRows(rows: string[] | undefined): ScArg[] | undefined {
    return rows?.map((row) => {
        const eq = row.indexOf("=");
        return eq < 0
            ? { name: row }
            : { name: row.slice(0, eq), default: row.slice(eq + 1) };
    });
}
