import { inject, injectable } from "@theia/core/shared/inversify";
import {
    ScServerWatcherClient,
    ScServerWatcherService,
} from "../common/protocol";
import { ScServiceBrowser } from "./sc-service-browser";
import { ScServerWatcherCore } from "../common/sc-server-watcher-core";
import { BrowserStatusTransport } from "./sc-status-transport-browser";

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

    setClient(): void {}
    getClient(): ScServerWatcherClient {
        return this.client;
    }
    dispose(): void {
        this.core?.dispose();
    }
}
