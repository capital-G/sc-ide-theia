import { Emitter, Event } from "@theia/core";
import { ScTheiaMessage } from "../common/sc-service-core";
import { inject, injectable } from "@theia/core/shared/inversify";
import { SC_SERVER_INFO_ADDRESS } from "../common/protocol";
import { ScClientImpl } from "./sc-client-impl";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";

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

    state: ServerBootStatus = { status: "offline" };
    cpu: ServerCpuInfo = {
        peak: 0.0,
        average: 0.0,
    };
    info: ServerSynthInfo = {
        numSynths: 0,
        numGroups: 0,
        numUGens: 0,
        numSynthDefs: 0,
    };

    onStart(): void {
        this.client.onLangMessageEvent((msg) => {
            if (msg.selector === SC_SERVER_INFO_ADDRESS) {
                this.parseMessage(msg);
            }
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
                // serverBooting, serverRunning, hostname, port, unresponsive
                const booting = Boolean(args[0]);
                const running = Boolean(args[1]);
                const hostname = args[2];
                const port = Number(args[3]);
                const unresponsive = Boolean(args[4]);

                if (booting) {
                    this.state = {
                        status: "booting",
                        hostname,
                        port,
                    };
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
            case "cpu":
                [this.cpu.average, this.cpu.peak] = args.map((x) => Number(x));
                this.cpuEmitter.fire(this.cpu);
                break;
            case "synth":
                [
                    this.info.numSynths,
                    this.info.numGroups,
                    this.info.numSynthDefs,
                    this.info.numUGens,
                ] = args.map((x) => Number(x));
                this.synthInfoEmitter.fire(this.info);
                break;
        }
    }
}
