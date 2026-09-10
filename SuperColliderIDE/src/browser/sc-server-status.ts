import { Emitter, Event } from "@theia/core";
import { ScTheiaMessage } from "../common/sc-service-core";
import { inject, injectable } from "@theia/core/shared/inversify";
import {
    SC_SERVER_INFO_ADDRESS,
    ScServerWatcherService,
} from "../common/protocol";
import { ScClientImpl } from "./sc-client-impl";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ScServerWatcherClientImpl } from "./sc-server-watcher-client-impl";

export interface ServerCpuInfo {
    peak: number;
    average: number;
}

export interface ServerSynthInfo {
    numSynths: number;
    numGroups: number;
    numUGens: number;
    numSynthDefs: number;
}

export type ServerBootStatus =
    | { status: "offline" }
    | { status: "booting"; hostname: string; port: number }
    | { status: "online"; hostname: string; port: number }
    | { status: "unresponsive" };

@injectable()
export class ScServerStatus implements FrontendApplicationContribution {
    @inject(ScClientImpl) protected readonly client!: ScClientImpl;
    @inject(ScServerWatcherService)
    protected readonly serverWatcher!: ScServerWatcherService;
    @inject(ScServerWatcherClientImpl)
    protected readonly watcherClient!: ScServerWatcherClientImpl;

    state: ServerBootStatus = { status: "offline" };

    onStart(): void {
        this.client.onLangMessageEvent((msg) => {
            if (msg.selector === SC_SERVER_INFO_ADDRESS) {
                this.parseMessage(msg);
            }
        });

        this.watcherClient.onServerInfoEvent((info) => {
            if (this.state.status === "booting") {
                this.setState({ ...this.state, status: "online" });
            }
            this.synthInfoEmitter.fire(info.synths);
            this.cpuEmitter.fire(info.cpu);
        });
    }

    protected readonly cpuEmitter = new Emitter<ServerCpuInfo>();
    readonly onCpuChanged: Event<ServerCpuInfo> = this.cpuEmitter.event;

    protected readonly statusEmitter = new Emitter<ServerBootStatus>();
    readonly onServerStatusChanged: Event<ServerBootStatus> =
        this.statusEmitter.event;

    protected readonly synthInfoEmitter = new Emitter<ServerSynthInfo>();
    readonly onServerInfoChanged: Event<ServerSynthInfo> =
        this.synthInfoEmitter.event;

    parseMessage(msg: ScTheiaMessage): void {
        const [selector, ...args] = msg.payload;
        switch (selector) {
            case "state":
                // serverBooting, serverRunning, hostname, port, unresponsive.
                // node uses OSC-typed values (bool/int), wasm uses strings
                const truthy = (v: unknown): boolean =>
                    v === true || v === 1 || v === "true" || v === "1";
                const booting = truthy(args[0]);
                const running = truthy(args[1]);
                const hostname = args[2];
                const port = Number(args[3]);
                const unresponsive = truthy(args[4]);

                if (booting) {
                    this.state = {
                        status: "booting",
                        hostname,
                        port,
                    };
                    this.serverWatcher.startWatching(hostname, port);
                } else if (unresponsive) {
                    this.state.status = "unresponsive";
                } else if (running) {
                    this.state = {
                        status: "online",
                        hostname,
                        port,
                    };
                } else {
                    this.state.status = "offline";
                }
                this.statusEmitter.fire(this.state);
                break;
        }
    }

    protected setState(state: ServerBootStatus): void {
        this.state = state;
        this.statusEmitter.fire(state);
    }
}
