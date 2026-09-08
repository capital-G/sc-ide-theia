import { Socket, createSocket } from "dgram";
import OSC from "osc-js";

/** allows us to receive osc messages from the language client */
export class SclangUdp {
    protected socket: Socket | undefined;

    constructor(protected readonly onMessage: (msg: OSC.Message) => void) {}

    async start(): Promise<number> {
        const socket = createSocket("udp4");
        this.socket = socket;
        socket.on("message", (buf) => {
            const message = new OSC.Message("");
            message.unpack(
                new DataView(buf.buffer, buf.byteOffset, buf.byteLength),
            );
            this.onMessage(message);
        });
        await new Promise<void>((resolve) =>
            socket.bind(0, "127.0.0.1", resolve),
        );
        return socket.address().port;
    }

    async sendOscMessage(
        msg: OSC.Message,
        host: string,
        port: number,
    ): Promise<void> {
        this.socket?.send(msg.pack(), port, host);
    }

    dispose(): void {
        this.socket?.close();
        this.socket = undefined;
    }
}
