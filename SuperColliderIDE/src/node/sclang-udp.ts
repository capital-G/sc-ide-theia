import { Socket, createSocket } from "dgram";
import OSC from "osc-js";

/** allows us to receive osc messages from the language client */
export class SclangUdp {
    protected socket: Socket | undefined;

    constructor(protected readonly onMessage: (bytes: Uint8Array) => void) {}

    async start(): Promise<number> {
        const socket = createSocket("udp4");
        this.socket = socket;
        socket.on("message", (buf) => {
            this.onMessage(buf);
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
        this.send(msg.pack(), host, port);
    }

    /** an already packed OSC message */
    send(bytes: Uint8Array, host: string, port: number): void {
        this.socket?.send(bytes, port, host);
    }

    dispose(): void {
        this.socket?.close();
        this.socket = undefined;
    }
}
