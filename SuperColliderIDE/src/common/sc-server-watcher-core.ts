import OSC from "osc-js";
import { Emitter, Event } from "@theia/core";
import { ScServerInfo } from "./protocol";

export interface ScStatusTransport {
    /** sends `/status` to a running server */
    requestStatus(): void;
    /** fires for every OSC message the server sends back */
    readonly onOscReply: Event<OSC.Message>;
    dispose(): void;
}

export class ScServerWatcherCore {
    static readonly REPLY_TIMER_MS = 500;

    protected timer: ReturnType<typeof setInterval> | undefined;

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

    protected onOsc(msg: OSC.Message): void {
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
        }
    }

    dispose(): void {
        this.stop();
        this.transport.dispose();
        this.infoEmitter.dispose();
    }
}
