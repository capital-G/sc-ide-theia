import { inject, injectable } from "@theia/core/shared/inversify";
import {
    ScServerWatcherClient,
    ScServerWatcherService,
} from "../common/protocol";
import { ScServiceBrowser } from "./sc-service-browser";
import { ScServerWatcherCore } from "../common/sc-server-watcher-core";
import { BrowserStatusTransport } from "./sc-status-transport-browser";
import {
    ScGroupNode,
    freeAllMessage,
    freeNodeMessage,
    runNodeMessage,
    setControlMessage,
} from "../common/sc-node-tree";

@injectable()
export class ScServerWatcherBrowser implements ScServerWatcherService {
    @inject(ScServerWatcherClient)
    protected readonly client!: ScServerWatcherClient;
    @inject(ScServiceBrowser) readonly sc!: ScServiceBrowser;

    protected core: ScServerWatcherCore | undefined;

    /** we only have one server in wasm, so we ignore the host and port here */
    startWatching(_host: string, _port: number): void {
        this.core?.dispose();
        const transport = new BrowserStatusTransport(this.sc.serverTransport);
        this.core = new ScServerWatcherCore(transport);
        this.core.onServerInfo((info) => this.client.onServerInfo(info));
        this.core.start();
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

    setClient(): void {}
    getClient(): ScServerWatcherClient {
        return this.client;
    }
    dispose(): void {
        this.core?.dispose();
    }
}
