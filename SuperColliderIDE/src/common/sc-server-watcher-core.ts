import OSC from "osc-js";
import { Emitter, Event } from "@theia/core";
import { ScServerInfo } from "./protocol";
import {
    SC_QUERY_TREE_REPLY,
    ScGroupNode,
    parseQueryTreeReply,
    queryTreeMessage,
} from "./sc-node-tree";

export interface ScStatusTransport {
    /** sends `/status` to a running server */
    requestStatus(): void;
    /** sends a packed OSC message to the server */
    send(bytes: Uint8Array): void;
    /** fires for every OSC message the server sends back */
    readonly onOscReply: Event<Uint8Array>;
    dispose(): void;
}

/** a node tree w/ a few hundred synths and their controls takes a while */
const QUERY_TREE_TIMEOUT_MS = 1000;

interface PendingTreeQuery {
    promise: Promise<ScGroupNode | undefined>;
    resolve(tree: ScGroupNode | undefined): void;
    timer: ReturnType<typeof setTimeout>;
}

export class ScServerWatcherCore {
    static readonly REPLY_TIMER_MS = 500;

    protected timer: ReturnType<typeof setInterval> | undefined;
    protected pendingTree: PendingTreeQuery | undefined;

    protected readonly infoEmitter = new Emitter<ScServerInfo>();
    readonly onServerInfo: Event<ScServerInfo> = this.infoEmitter.event;

    constructor(protected readonly transport: ScStatusTransport) {
        this.transport.onOscReply((msg) => this.onOsc(msg));
    }

    start(): void {
        this.stop();
        this.timer = setInterval(
            () => this.transport.requestStatus(),
            ScServerWatcherCore.REPLY_TIMER_MS,
        );
    }

    stop(): void {
        clearInterval(this.timer);
        this.timer = undefined;
    }

    /**
     * The whole node tree, undefined if the server did not answer in time.
     * Concurrent calls share one query.
     */
    queryTree(controls: boolean): Promise<ScGroupNode | undefined> {
        if (this.pendingTree) {
            return this.pendingTree.promise;
        }
        let resolve!: (tree: ScGroupNode | undefined) => void;
        const promise = new Promise<ScGroupNode | undefined>(
            (r) => (resolve = r),
        );
        const pending: PendingTreeQuery = {
            promise,
            resolve,
            timer: setTimeout(
                () => this.resolveTree(undefined),
                QUERY_TREE_TIMEOUT_MS,
            ),
        };
        this.pendingTree = pending;
        this.transport.send(queryTreeMessage(controls));
        return promise;
    }

    /** sends a packed OSC message, e.g. `/n_set` */
    send(bytes: Uint8Array): void {
        this.transport.send(bytes);
    }

    protected resolveTree(tree: ScGroupNode | undefined): void {
        const pending = this.pendingTree;
        this.pendingTree = undefined;
        if (pending) {
            clearTimeout(pending.timer);
            pending.resolve(tree);
        }
    }

    protected onOsc(bytes: Uint8Array): void {
        const msg = new OSC.Message("");
        msg.unpack(
            new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        );
        if (msg.address === "/status.reply") {
            this.infoEmitter.fire({
                synths: {
                    numUGens: msg.args[1] as number,
                    numSynths: msg.args[2] as number,
                    numGroups: msg.args[3] as number,
                    numSynthDefs: msg.args[4] as number,
                },
                cpu: {
                    average: msg.args[5] as number,
                    peak: msg.args[6] as number,
                },
            });
        } else if (msg.address === SC_QUERY_TREE_REPLY && this.pendingTree) {
            this.resolveTree(parseQueryTreeReply(msg.args));
        }
    }

    dispose(): void {
        this.stop();
        this.resolveTree(undefined);
        this.transport.dispose();
        this.infoEmitter.dispose();
    }
}
