import { inject, injectable } from "@theia/core/shared/inversify";
import { InterpreterState, ScArg, ScClient, ScMethodRef, ScService } from "../common/protocol";

@injectable()
export class ScServiceStub implements ScService {
    resolveSclangPath(): Promise<string | undefined> {
        throw new Error("Method not implemented.");
    }
    dispose(): void {
        throw new Error("Method not implemented.");
    }
    setClient(client: ScClient | undefined): void {
        throw new Error("Method not implemented.");
    }
    getClient?(): ScClient | undefined {
        throw new Error("Method not implemented.");
    }
    @inject(ScClient) protected readonly client!: ScClient;

    protected state: InterpreterState = { kind: "stopped" };

    async startInterpreter(): Promise<void> { this.client.onPost("NOT DONE"); }
    async stopInterpreter(): Promise<void> { }
    async restartInterpreter(): Promise<void> { this.client.onPost("NOT DONE"); }
    async recompile(): Promise<void> { }
    async evaluate(code: string): Promise<void> { this.client.onPost(`NOT DONE: ${code}\n`); }
    async send(): Promise<void> { }
    async interpreterState(): Promise<InterpreterState> { return this.state; }

    async queryClass(): Promise<string[]> { return []; }
    async queryMethod(): Promise<ScMethodRef[]> { return []; }
    async queryArgs(): Promise<ScArg[] | undefined> { return undefined; }
    async queryEnvClass(): Promise<string | undefined> { return undefined; }
}
