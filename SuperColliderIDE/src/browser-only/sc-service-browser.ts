import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import { InterpreterState, ScArg, ScClient, ScMethodRef, ScMethodSide, ScService } from "../common/protocol";
import { SclangWasmRuntime } from "./sclang-wasm-runtime";
import { ScServiceCore } from "../common/sc-service-core";
import { ScsynthWasm } from "./scsynth-wasm";

@injectable()
export class ScServiceBrowser implements ScService {
    // in the wasm build sc client gets bound as a service
    // and is nto a rpc server
    @inject(ScClient) protected readonly client!: ScClient;

    // @ts-ignore:next-line
    protected readonly scsynth = new ScsynthWasm(bytes => this.runtime.sendOsc(bytes));
    // @ts-ignore:next-line
    protected readonly runtime = new SclangWasmRuntime(bytes => this.scsynth.sendOsc(bytes));
    protected readonly core = new ScServiceCore(this.runtime);

    // run this only after everything has been constructed b/c we rely on the injection
    // to be available
    @postConstruct()
    protected init(): void {
        this.core.onPost(chunk => this.client.onPost(chunk));
        this.core.onStateChanged(state => this.client.onInterpreterStateChanged(state));
        this.core.onLangMessage(msg => this.client.onLangMessage(msg));
        this.scsynth.installGlobals();
    }

    startInterpreter(): Promise<void> { return this.core.start(); }
    stopInterpreter(): Promise<void> { return this.core.stop(); }
    // this does not work yet properly^^
    restartInterpreter(): Promise<void> { return this.core.recompile(); }
    recompile(): Promise<void> { return this.core.recompile(); }

    async evaluate(code: string, silent?: boolean): Promise<void> {
        return this.core.evaluate(code, silent);
    }

    async send(selector: string, data: unknown): Promise<void> {
        // i think this should go...
    }

    async interpreterState(): Promise<InterpreterState> {
        return this.core.interpreterState();
    }

    resolveSclangPath(): Promise<string | undefined> {
        // this should probably also not part of the interface anymore ;)
        throw new Error("Method not implemented.");
    }

    queryClass(text: string): Promise<string[]> {
        return this.core.queryClass(text);
    }
    queryMethod(text: string, receiver?: string, side?: ScMethodSide): Promise<ScMethodRef[]> {
        return this.core.queryMethod(text, receiver, side);
    }
    queryArgs(ref: ScMethodRef): Promise<ScArg[] | undefined> {
        return this.core.queryArgs(ref);
    }
    queryEnvClass(text: string): Promise<string | undefined> {
        return this.core.queryEnvClass(text);
    }

    // rpc stuff - not applicable here...
    setClient(client: ScClient | undefined): void { }
    getClient(): ScClient { return this.client; }
    dispose(): void { this.core.dispose(); }
}
