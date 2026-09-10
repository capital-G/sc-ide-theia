import OSC from "osc-js";
import { Emitter } from "@theia/core";
import { ScStatusTransport } from "../common/sc-server-watcher-core";
import { SclangUdp } from "./sclang-udp";

export class NodeStatusTransport implements ScStatusTransport {
    protected readonly emitter = new Emitter<Uint8Array>();
    readonly onOscReply = this.emitter.event;
    protected udp: SclangUdp | undefined;
    protected static OSC_STATUS = new OSC.Message("/status");

    constructor(
        protected readonly host: string,
        protected readonly port: number,
    ) {}

    async start(): Promise<void> {
        this.udp = new SclangUdp((bytes) => this.emitter.fire(bytes));
        await this.udp.start();
    }

    requestStatus(): void {
        this.udp?.sendOscMessage(
            NodeStatusTransport.OSC_STATUS,
            this.host,
            this.port,
        );
    }

    dispose(): void {
        this.udp?.dispose();
        this.emitter.dispose();
    }
}
