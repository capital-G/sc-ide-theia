import { Emitter, Event } from "@theia/core";
import { SC_WASM_BASE_URL } from "./sclang-wasm-runtime";
import { importGlue } from "./tools";

interface ScsynthModule {
    boot(options: any): void;
    sendOsc(bytes: Uint8Array): void;
    /** replies from the server; the buffer is freed on return, so copy it */
    onOscReply: (msg: Uint8Array) => void;
    onPrint: (line: string) => void;
    getAudioContext(): AudioContext;
    /** undefined until the audio worklet thread of scsynth got started */
    getWorkletNode(): AudioWorkletNode | undefined;
}

type ScsynthFactory = (cfg: {
    locateFile(path: string): string;
}) => Promise<ScsynthModule>;

/** the audio output of scsynth, e.g. to tap it for analysis */
export interface ScsynthOutput {
    context: AudioContext;
    node: AudioNode;
    channels: number;
}

/** how long to wait for scsynth's audio worklet after booting */
const WORKLET_NODE_TIMEOUT_MS = 10_000;

export class ScsynthWasm {
    protected module: ScsynthModule | undefined;
    // acts as a singleton guard
    protected booting: Promise<void> | undefined;

    protected readonly postEmitter = new Emitter<string>();
    readonly onPost: Event<string> = this.postEmitter.event;

    protected readonly replyEmitter = new Emitter<Uint8Array>();
    readonly onOscReplyEvent: Event<Uint8Array> = this.replyEmitter.event;

    protected readonly bootedEmitter = new Emitter<ScsynthOutput>();
    /** fires once the audio worklet is running */
    readonly onBooted: Event<ScsynthOutput> = this.bootedEmitter.event;

    protected _output: ScsynthOutput | undefined;
    get output(): ScsynthOutput | undefined {
        return this._output;
    }

    constructor(
        // pass osc messages back to sclang
        protected readonly onReply: (bytes: Uint8Array) => void,
        protected readonly baseUrl: string = SC_WASM_BASE_URL,
    ) {}

    boot(options: any): Promise<void> {
        // keep the worklet a singleton
        this.booting ??= this.doBoot(options);
        return this.booting;
    }

    protected async doBoot(options: any): Promise<void> {
        const url = `${this.baseUrl}/scsynth.js`;
        const { default: factory } = await importGlue<ScsynthFactory>(url);

        // same hack as w/ sclang
        const module = await factory({
            locateFile: (path) => `${this.baseUrl}/${path}`,
        });

        module.onPrint = (line) => this.postEmitter.fire(`${line}\n`);
        module.onOscReply = (bytes) => {
            const copy = new Uint8Array(bytes);
            // forward to sclang
            this.onReply(copy);
            // but also to ourselves so we can extract
            // e.g. /status.reply
            this.replyEmitter.fire(copy);
        };
        module.boot(options);
        this.module = module;

        await module.getAudioContext().resume();
        const node = await this.waitForWorkletNode(module);
        if (!node) {
            this.postEmitter.fire(
                "[scsynth] The audio worklet did not start, the scopes and the audio input are not available\n",
            );
            return;
        }
        this._output = {
            context: module.getAudioContext(),
            node,
            channels: options.numOutputBusChannels ?? 2,
        };
        this.bootedEmitter.fire(this._output);

        if ((options.numInputBusChannels ?? 0) > 0) {
            await this.connectMic(module, node);
        }
    }

    /**
     * The worklet node gets created once scsynth's audio worklet thread runs,
     * which happens asynchronously after `boot`.
     */
    protected async waitForWorkletNode(
        module: ScsynthModule,
    ): Promise<AudioWorkletNode | undefined> {
        const deadline = Date.now() + WORKLET_NODE_TIMEOUT_MS;
        while (Date.now() < deadline) {
            const node = module.getWorkletNode();
            if (node) {
                return node;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return undefined;
    }

    /** we have to pass the mic to scsynth */
    protected async connectMic(
        module: ScsynthModule,
        node: AudioWorkletNode,
    ): Promise<void> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
            });
            const context = module.getAudioContext();
            context.createMediaStreamSource(stream).connect(node);
        } catch (err) {
            this.postEmitter.fire(
                `[scsynth] Failed to access audio input: ${err}\n`,
            );
        }
    }

    sendOsc(bytes: Uint8Array): void {
        this.module?.sendOsc(bytes);
    }

    /**
     * some ai magic...
     *
     * sclang reaches JS through `emscripten_run_script`, which evaluates in *window* scope -
     * a module-scope binding is invisible to it. `Server:bootServerApp` emits the literal
     * source `bootServer({...})` (SystemOverwrites/overwrites.sc:1-5).
     */
    installGlobals(): void {
        (window as unknown as Record<string, unknown>).bootServer = (
            options: any,
        ) => {
            // the reference init.js defers by 100ms and it is worth keeping: this runs
            // inside a sclang -> main-thread hop and wants that task to finish first
            setTimeout(() => void this.boot(options), 100);
        };
    }

    dispose(): void {
        this.postEmitter.dispose();
        this.bootedEmitter.dispose();
    }
}
