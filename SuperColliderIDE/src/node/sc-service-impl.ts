import { injectable } from "@theia/core/shared/inversify";
import { BackendApplicationContribution } from "@theia/core/lib/node";
import { InterpreterState, ScClient, ScService } from "../common/protocol";
import { EVALUATE, RECOMPILE, SclangProcess } from "./sclang-process";

@injectable()
export class ScServiceImpl implements ScService, BackendApplicationContribution {
    restartInterpreter(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    protected process: SclangProcess | undefined;
    protected client: ScClient | undefined;
    protected state: InterpreterState = { kind: "stopped" };

    setClient(client: ScClient | undefined): void {
        this.client = client;
    }
    
    getClient(): ScClient | undefined {
        return this.client;
    }

    async startInterpreter(): Promise<void> {
            if(this.process) {
                console.log("Interpreter already spawned - ignoring request");
                return;
            }
            this.process = new SclangProcess(
                {
                    sclangPath: "/Applications/SuperCollider-3.14.1.app/Contents/MacOS/sclang",
                    ideName: "theia"
                },
                chunk => this.client?.onPost(chunk),
                code => this.setState({ kind: 'stopped', exitCode: code ?? undefined })
            );
            this.process.start();
            this.setState({kind: 'running', pid: this.process.pid!, compiled: false, channelUp: false});
    }

    async evaluate(code: string, silent?: boolean): Promise<void> {
        this.process?.write(code, EVALUATE);
    }

    protected setState(state: InterpreterState): void {
        this.state = state;
        this.client?.onInterpreterStateChanged(state);
    }


    async stopInterpreter(): Promise<void> {
        
    }

    async recompile(): Promise<void> {
        this.process?.write("", RECOMPILE);
    }

    async send(selector: string, data: unknown): Promise<void> {
        
    }

    async interpreterState(): Promise<InterpreterState> {
        return this.state;
    }

    resolveSclangPath(): Promise<string | undefined> {
        return new Promise(() => undefined);
    }

    onStop(): void {
        this.dispose();
    }

    dispose(): void {
        this.process?.kill();
        this.process = undefined;
    }

}
