import { RpcServer } from "@theia/core";

export const SC_SERVICE_PATH = "/services/supercollider";
export const ScService = Symbol("ScService");
export const ScClient = Symbol("ScClient");

export type InterpreterState = 
    | { kind: "stopped"; exitCode?: number }
    | { kind: "starting", pid: number }
    | { kind: "running", pid: number, compiled: boolean, channelUp: boolean};

export const SC_CLASS_REGEX = /^[A-Z][A-Za-z0-9_]*$/;

/**
 * One decoded frame from sclang.
 * Data is parsed JSON.
 */
export interface LangMessage {selector: string; data: unknown}

/**
 * Defines the service between backend and frontend.
 */
export interface ScService extends RpcServer<ScClient> {
    startInterpreter(): Promise<void>;
    stopInterpreter(): Promise<void>;
    restartInterpreter(): Promise<void>;
    recompile(): Promise<void>;
    // user code
    evaluate(code: string, silent?: boolean): Promise<void>;
    // internal lookups for IDE
    send(selector: string, data: unknown): Promise<void>;
    interpreterState(): Promise<InterpreterState>;
    resolveSclangPath(): Promise<string | undefined>;

    // autocomplete stuff - this should be at some day handled by a LSP ;)
    query(selector: string, arg: string): Promise<string[]>;
}

export interface ScClient {
    onPost(chunk: string): void;
    onInterpreterStateChanged(state: InterpreterState): void;
    onLangMessage(msg: LangMessage): void;
}
