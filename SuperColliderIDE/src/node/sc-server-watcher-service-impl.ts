import { injectable } from "@theia/core/shared/inversify";
import {
    ScServerWatcherClient,
    ScServerWatcherService,
    ScServerInfo,
} from "../common/protocol";
import { BackendApplicationContribution } from "@theia/core/lib/node";
import { SclangUdp } from "./sclang-udp";
import OSC from "osc-js";
import { MaybePromise } from "@theia/core";

@injectable()
export class ScServerWatcherServiceImpl
    implements ScServerWatcherService, BackendApplicationContribution
{
    protected static REPLY_TIMER_MS = 500;
    protected watcher: ScServerWatcherClient | undefined;
    protected udp: SclangUdp | undefined;
    protected replyRoutine: NodeJS.Timeout | undefined;
    protected port: number | undefined;
    protected host?: string | undefined;

    protected static oscMessage = new OSC.Message("/status");

    setClient(watcher: ScServerWatcherClient | undefined): void {
        this.watcher = watcher;
    }

    getClient?(): ScServerWatcherClient | undefined {
        return this.watcher;
    }

    async startWatching(host: string, port: number): Promise<void> {
        this.stopWatching();

        this.host = host;
        this.port = port;

        if (!this.udp) {
            this.udp = new SclangUdp((bytes) => this.onOsc(bytes));
            await this.udp.start();
        }

        this.replyRoutine = setInterval(() => {
            this.sendStatusRequest();
        }, ScServerWatcherServiceImpl.REPLY_TIMER_MS);
    }

    protected sendStatusRequest() {
        if (!this.host || !this.port) {
            return undefined;
        }
        this.udp?.sendOscMessage(
            ScServerWatcherServiceImpl.oscMessage,
            this.host,
            this.port,
        );
    }

    stopWatching() {
        clearInterval(this.replyRoutine);
    }

    onOsc(bytes: Uint8Array): void {
        const msg = new OSC.Message("");
        msg.unpack(
            new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        );
        if (msg.address === "/status.reply") {
            const info: ScServerInfo = {
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
            };
            this.watcher?.onServerInfo(info);
        }
    }

    onStop(): MaybePromise<void> {
        this.dispose();
    }

    dispose(): void {
        this.stopWatching();
        this.udp?.dispose();
    }
}
