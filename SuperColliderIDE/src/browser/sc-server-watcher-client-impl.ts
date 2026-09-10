import { injectable } from "@theia/core/shared/inversify";
import { ScServerInfo, ScServerWatcherClient } from "../common/protocol";
import { Emitter, Event } from "@theia/core";

@injectable()
export class ScServerWatcherClientImpl implements ScServerWatcherClient {
    protected readonly serverInfoEmitter = new Emitter<ScServerInfo>();
    readonly onServerInfoEvent: Event<ScServerInfo> =
        this.serverInfoEmitter.event;

    onServerInfo(info: ScServerInfo): void {
        this.serverInfoEmitter.fire(info);
    }
}
