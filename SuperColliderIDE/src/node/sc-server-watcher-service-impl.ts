import { injectable } from "@theia/core/shared/inversify";
import { MaybePromise } from "@theia/core";
import { BackendApplicationContribution } from "@theia/core/lib/node";
import {
    ScServerWatcherClient,
    ScServerWatcherService,
} from "../common/protocol";
import { ScServerWatcherCore } from "../common/sc-server-watcher-core";
import {
    ScGroupNode,
    freeAllMessage,
    freeNodeMessage,
    runNodeMessage,
    setControlMessage,
} from "../common/sc-node-tree";
import { NodeStatusTransport } from "./sc-status-transport-node";

/** talks OSC to the server sclang booted, e.g. `/status` and `/g_queryTree` */
@injectable()
export class ScServerWatcherServiceImpl
    implements ScServerWatcherService, BackendApplicationContribution
{
    protected watcher: ScServerWatcherClient | undefined;
    protected core: ScServerWatcherCore | undefined;

    setClient(watcher: ScServerWatcherClient | undefined): void {
        this.watcher = watcher;
    }

    getClient?(): ScServerWatcherClient | undefined {
        return this.watcher;
    }

    async startWatching(host: string, port: number): Promise<void> {
        this.core?.dispose();
        this.core = undefined;
        const transport = new NodeStatusTransport(host, port);
        await transport.start();
        const core = new ScServerWatcherCore(transport);
        core.onServerInfo((info) => this.watcher?.onServerInfo(info));
        core.start();
        this.core = core;
    }

    async queryTree(controls: boolean): Promise<ScGroupNode | undefined> {
        return this.core?.queryTree(controls);
    }

    async setControl(id: number, name: string, value: number): Promise<void> {
        this.core?.send(setControlMessage(id, name, value));
    }

    async runNode(id: number, run: boolean): Promise<void> {
        this.core?.send(runNodeMessage(id, run));
    }

    async freeNode(id: number): Promise<void> {
        this.core?.send(freeNodeMessage(id));
    }

    async freeAll(groupId: number): Promise<void> {
        this.core?.send(freeAllMessage(groupId));
    }

    onStop(): MaybePromise<void> {
        this.dispose();
    }

    dispose(): void {
        this.core?.dispose();
        this.core = undefined;
    }
}
