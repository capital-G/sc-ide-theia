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
    getWorkletNode(): AudioWorkletNode;
}


type ScsynthFactory = (cfg: { locateFile(path: string): string }) => Promise<ScsynthModule>;

export class ScsynthWasm {
    protected module: ScsynthModule | undefined;
    // acts as a singleton guard
    protected booting: Promise<void> | undefined;

    protected readonly postEmitter = new Emitter<string>();
    readonly onPost: Event<string> = this.postEmitter.event;

    constructor(
        // pass osc messages back to sclang
        protected readonly onReply: (bytes: Uint8Array) => void,
        protected readonly baseUrl: string = SC_WASM_BASE_URL,
    ) { }

    boot(options: any): Promise<void> {
        // keep the worklet a singleton
        this.booting ??= this.doBoot(options);
        return this.booting;
    }

    protected async doBoot(options: any): Promise<void> {
        const url = `${this.baseUrl}/scsynth.js`;
        const { default: factory } = await importGlue<ScsynthFactory>(url);

        // same hack as w/ sclang
        const module = await factory({ locateFile: path => `${this.baseUrl}/${path}` });

        module.onPrint = line => this.postEmitter.fire(`${line}\n`);
        module.onOscReply = bytes => this.onReply(new Uint8Array(bytes));
        module.boot(options);
        this.module = module;

        await module.getAudioContext().resume();

        if ((options.numInputBusChannels ?? 0) > 0) { await this.connectMic(module); }
    }

    /** we have to pass the mic to scsynth */
    protected async connectMic(module: ScsynthModule): Promise<void> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const context = module.getAudioContext();
            context.createMediaStreamSource(stream).connect(module.getWorkletNode());
        } catch (err) {
            this.postEmitter.fire(`[scsynth] Failed to access audio input: ${err}\n`);
        }
    }

    sendOsc(bytes: Uint8Array): void { this.module?.sendOsc(bytes); }

    /**
     * some ai magic...
     * 
     * sclang reaches JS through `emscripten_run_script`, which evaluates in *window* scope -
     * a module-scope binding is invisible to it. `Server:bootServerApp` emits the literal
     * source `bootServer({...})` (SystemOverwrites/overwrites.sc:1-5).
     */
    installGlobals(): void {
        (window as unknown as Record<string, unknown>).bootServer =
            (options: any) => {
                // the reference init.js defers by 100ms and it is worth keeping: this runs
                // inside a sclang -> main-thread hop and wants that task to finish first
                setTimeout(() => void this.boot(options), 100);
            };
    }

    dispose(): void { this.postEmitter.dispose(); }
}
