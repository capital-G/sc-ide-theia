import { injectable } from "@theia/core/shared/inversify";
import { BackendApplicationContribution } from "@theia/core/lib/node";
import { InterpreterState, ScClient, ScService } from "../common/protocol";

@injectable()
export class ScServiceImpl implements ScService, BackendApplicationContribution {
    restartInterpreter(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    private defaultInterpreterState: InterpreterState = { kind: "stopped"};
    
    protected client: ScClient | undefined;

    setClient(client: ScClient | undefined): void {
        this.client = client;
    }
    
    getClient(): ScClient | undefined {
        return this.client;
    }

    async startInterpreter(): Promise<void> {

    }

    async stopInterpreter(): Promise<void> {
        
    }

    async recompile(): Promise<void> {
        
    }

    async evaluate(code: string, silent?: boolean): Promise<void> {
        
    }

    async send(selector: string, data: unknown): Promise<void> {
        
    }

    async interpreterState(): Promise<InterpreterState> {
        return this.defaultInterpreterState;
    }

    resolveSclangPath(): Promise<string | undefined> {
        return new Promise(() => undefined);
    }

    onStop(): void {
        this.dispose();
    }

    dispose(): void {
        // kill sclang
    }

}
