import OSC from "osc-js";
import { Emitter } from "@theia/core";
import { ScStatusTransport } from "../common/sc-server-watcher-core";
import { ScsynthWasm } from "./scsynth-wasm";
import { Disposable } from "@theia/core/lib/common/disposable";

export class BrowserStatusTransport implements ScStatusTransport {
    protected readonly emitter = new Emitter<OSC.Message>();
    readonly onOscReply = this.emitter.event;
    protected readonly sub: Disposable;
    protected static OSC_STATUS_MESSAGE = new OSC.Message("/status").pack();

    constructor(protected readonly scsynth: ScsynthWasm) {
        this.sub = scsynth.onOscReplyEvent((bytes) => {
            const msg = new OSC.Message("");
            msg.unpack(
                new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            );
            this.emitter.fire(msg);
        });
    }

    requestStatus(): void {
        this.scsynth.sendOsc(BrowserStatusTransport.OSC_STATUS_MESSAGE);
    }

    dispose(): void {
        this.emitter.dispose();
    }
}
