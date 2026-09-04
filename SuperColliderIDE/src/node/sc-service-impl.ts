import { injectable } from "@theia/core/shared/inversify";
import { BackendApplicationContribution } from "@theia/core/lib/node";
import { InterpreterState, ScArg, ScClient, ScMethodRef, ScMethodSide, ScService } from "../common/protocol";
import { SclangNodeRuntime } from "./sclang-node-runtime";
import { ScServiceCore } from "../common/sc-service-core";
import { MaybePromise } from "@theia/core";
import { Application } from "express";


/**
 * Acts as an adapter between the SclangNodeRuntime and ScService
 */
@injectable()
export class ScServiceImpl implements ScService, BackendApplicationContribution {
    protected client: ScClient | undefined;
    protected readonly runtime = new SclangNodeRuntime();
    protected readonly core = new ScServiceCore(this.runtime);

    constructor() {
        this.core.onPost(chunk => this.client?.onPost(chunk));
        this.core.onStateChanged(state => this.client?.onInterpreterStateChanged(state));
        this.core.onLangMessage(msg => this.client?.onLangMessage(msg));
    }

    setClient(client: ScClient | undefined): void { this.client = client; }
    getClient(): ScClient | undefined { return this.client; }
    

    startInterpreter(): Promise<void> { return this.core.start(); }
    stopInterpreter(): Promise<void> { return this.core.stop(); }
    restartInterpreter(): Promise<void> { return this.core.restart(); }
    recompile(): Promise<void> { return this.core.recompile(); }

    async evaluate(code: string, silent?: boolean): Promise<void> {
        return this.core.evaluate(code, silent);
    }

    async send(selector: string, data: unknown): Promise<void> {
        throw new Error("Method not implemented.");
    }

    onStop(app?: Application): MaybePromise<void> {
        this.dispose();
    }

    dispose(): void {
        this.core.dispose();
        this.runtime.dispose();
    }

    async interpreterState(): Promise<InterpreterState> {
        return this.core.interpreterState();
    }

    async resolveSclangPath(): Promise<string | undefined> {
        return undefined;
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
}
