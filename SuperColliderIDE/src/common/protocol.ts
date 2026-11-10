import { RpcServer } from "@theia/core";
import { ScTheiaMessage } from "./sc-service-core";
import { ScHelpTarget } from "./sc-help";

export const SC_SERVICE_PATH = "/services/supercollider";
export const SC_SERVER_WATCHER_PATH = "/services/scserverwatcher";
export const ScService = Symbol("ScService");
export const ScClient = Symbol("ScClient");
export const ScServerWatcherClient = Symbol("ScServerWatcher");
export const ScServerWatcherService = Symbol("ScServerWatcherService");

export type InterpreterState =
    | { kind: "stopped"; exitCode?: number }
    | { kind: "booting"; pid?: number }
    | { kind: "running"; pid?: number; compiled: boolean; channelUp: boolean };

export const SC_REPLY_ADDRESS = "/reply";
export const SC_SERVER_INFO_ADDRESS = "/server";

// capture by word
export const SC_CLASS_REGEX = /^[A-Z][A-Za-z0-9_]*$/;
export const SC_CLASS_TAIL_REGEX = /[A-Z][A-Za-z0-9_]*$/; // use for line prefix scanning
export const SC_STATIC_METHOD_REGEX =
    /([A-Z][A-Za-z0-9_]*)\.([a-z][A-Za-z0-9_]*)$/;
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

export interface ScArg {
    name: string;
    default?: string;
}
/** reference of the actual implementation of a method, i.e. its class handle */
export interface ScMethodRef {
    name: string;
    ownerClass: string;
    isClassMethod: boolean;
}
/** a source location reported by sclang */
export interface ScLocation {
    path: string;
    /** 0-based byte offset into the file, see `Method.charPos` */
    charPos: number;
}
/**
 * * class: the class definition
 * * classImpl: the class definition and all its methods (incl. extensions)
 * * method: the responding method of the receiver, or all implementations if unknown
 * * methodImpl: all implementations of the method name
 * * references: all methods referencing the symbol
 */
export type ScDefinitionKind =
    "class" | "classImpl" | "method" | "methodImpl" | "references";
/** Lazily obtained from the language */
export type ScMethodSide = "class" | "instance";
export const SC_QUERY_LIMIT = 50;

export enum QuerySelector {
    // ~theiaIde.("class", class);
    CLASS_LOOKUP = "class",
    // ~theiaIde.("method", prefix, receiverClass ?? "", side ?? "");
    METHOD_LOOKUP = "method",
    // ~theiaIde.("args", this.query, ref.name,ref.ownerClass, ref.isClassMethod ? "class" : "instance")
    ARGS_LOOKUP = "args",
    // ~foo becomes "foo"
    ENV_CLASS_LOOKUP = "envClass",
    // ~theiaIde.("classLibDir") - path in sclang's own filesystem
    CLASS_LIBRARY_DIR = "classLibDir",
    // ~theiaIde.("definition", kind, name, receiverClass ?? "", side ?? "")
    DEFINITION_LOOKUP = "definition",
    // ~theiaIde.("helpPrepare", path) - path relative to SCDoc.helpTargetDir
    HELP_PREPARE = "helpPrepare",
    // ~theiaIde.("helpFor", name, receiverClass ?? "", side ?? "")
    HELP_FOR = "helpFor",
    // ~theiaIde.("helpTargetDir") - path in sclang's own filesystem
    HELP_TARGET_DIR = "helpTargetDir",
}

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
    queryMethod(
        text: string,
        receiver?: string,
        side?: ScMethodSide,
    ): Promise<ScMethodRef[]>;
    queryArgs(ref: ScMethodRef): Promise<ScArg[] | undefined>;
    queryEnvClass(text: string): Promise<string | undefined>;
    /** path of the class library within sclang's filesystem */
    queryClassLibraryDir(): Promise<string | undefined>;
    /** source locations for go to definition/implementations/references */
    queryDefinition(
        kind: ScDefinitionKind,
        name: string,
        receiver?: string,
        side?: ScMethodSide,
    ): Promise<ScLocation[]>;
    /** renders the help page on demand, see `SCDoc.prepareHelpForURL` */
    prepareHelp(path: string): Promise<ScHelpTarget | undefined>;
    /** help page for a class or method, see `HelpBrowser.openHelpFor` */
    queryHelpFor(
        name: string,
        receiver?: string,
        side?: ScMethodSide,
    ): Promise<ScHelpTarget | undefined>;
    /** path of `SCDoc.helpTargetDir` within sclang's filesystem */
    queryHelpTargetDir(): Promise<string | undefined>;
}

export interface ScClient {
    onPost(chunk: string): void;
    onInterpreterStateChanged(state: InterpreterState): void;
    onLangMessage(msg: ScTheiaMessage): void;
}

export interface ScServerCpuInfo {
    peak: number;
    average: number;
}

export interface ScServerSynthInfo {
    numSynths: number;
    numGroups: number;
    numUGens: number;
    numSynthDefs: number;
}

export interface ScServerInfo {
    cpu: ScServerCpuInfo;
    synths: ScServerSynthInfo;
}

/** lives on frontend, backend calls it to push data */
export interface ScServerWatcherClient {
    onServerInfo(info: ScServerInfo): void;
}

/** lives on backend, frontend calls it */
export interface ScServerWatcherService extends RpcServer<ScServerWatcherClient> {
    startWatching(host: string, port: number): void;
}
