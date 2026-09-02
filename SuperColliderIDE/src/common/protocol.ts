import { RpcServer } from "@theia/core";

export const SC_SERVICE_PATH = "/services/supercollider";
export const ScService = Symbol("ScService");
export const ScClient = Symbol("ScClient");

export type InterpreterState = 
    | { kind: "stopped"; exitCode?: number }
    | { kind: "starting", pid: number }
    | { kind: "running", pid: number, compiled: boolean, channelUp: boolean};

// capture by word
export const SC_CLASS_REGEX = /^[A-Z][A-Za-z0-9_]*$/;
export const SC_CLASS_TAIL_REGEX = /[A-Z][A-Za-z0-9_]*$/; // use for line prefix scanning
export const SC_STATIC_METHOD_REGEX = /([A-Z][A-Za-z0-9_]*)\.([a-z][A-Za-z0-9_]*)$/;
export const SC_METHOD_REGEX = /(~?[a-z][A-Za-z0-9_]*)\.([a-z][A-Za-z0-9_]*)$/;
export const SC_ENV_REGEX = /~[A-Za-z][A-Za-z0-9_]*$/;

// matched by beginning and end
export const SC_METHOD_NAME = /^[a-z][A-Za-z0-9_]*$/;
export const SC_INTEGER = /^\d+$/;
export const SC_FLOAT = /^\d+\.\d+$/;
export const SC_ARRAY = /^\[[\s\S]*\]$/;
export const SC_FUNCTION = /^\{[\s\S]*\}$/;
export const SC_SYMBOL = /^\\[A-Za-z0-9_]+$|^'[\s\S]*'$/;
export const SC_STRING = /^"[\s\S]*"$/;

export interface ScArg { name: string; default?: string }
/** reference of the actual implementation of a method, i.e. its class handle */
export interface ScMethodRef { name: string; ownerClass: string; isClassMethod: boolean }
/** Lazily obtained from the language */
export type ScMethodSide = 'class' | 'instance';
export const SC_QUERY_LIMIT = 50;


export enum QuerySelector {
    // ~theiaIde.("class", class);
    CLASS_LOOKUP = "class",
    // ~theiaIde.("method", prefix, receiverClass ?? "", side ?? "");
    METHOD_LOOKUP = "method",
    // ~theiaIde.("args", this.query, ref.name,ref.ownerClass, ref.isClassMethod ? "class" : "instance")
    ARGS_LOOKUP = "args",
}

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

    queryClass(text: string): Promise<string[]>;
    queryMethod(text: string, receiver?: string, side?: ScMethodSide): Promise<ScMethodRef[]>;
    queryArgs(ref: ScMethodRef): Promise<ScArg[] | undefined>;
}

export interface ScClient {
    onPost(chunk: string): void;
    onInterpreterStateChanged(state: InterpreterState): void;
    onLangMessage(msg: LangMessage): void;
}
