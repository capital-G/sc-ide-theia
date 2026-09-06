import {
    FrontendApplicationContribution,
    QuickInputService,
    QuickPickItem,
    QuickPickSeparator,
    StatusBar,
    StatusBarAlignment,
} from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import {
    ScServerStatus,
    ServerBootStatus,
    ServerCpuInfo,
} from "./sc-server-status";
import { InterpreterState } from "../common/protocol";
import { ScClientImpl } from "./sc-client-impl";

export const SC_SERVER_STATE = "sc-server-state";
export const SC_SERVER_CPU = "sc-server-cpu";

export const SC_LANG_STATE = "sc-sclang-state";

@injectable()
export class ScStatusBarContribution implements FrontendApplicationContribution {
    @inject(StatusBar) protected readonly statusBar!: StatusBar;
    @inject(ScServerStatus) protected readonly serverStatus!: ScServerStatus;
    @inject(ScClientImpl) protected readonly client!: ScClientImpl;
    @inject(QuickInputService)
    protected readonly quickInput!: QuickInputService;

    protected interpreterState: InterpreterState = { kind: "stopped" };

    onStart(): void {
        this.client.onStateChangedEvent((state) => {
            this.interpreterState = state;
            this.renderLangStatus();
        });

        this.renderServerStatus({ status: "offline" });
        this.renderServerCpu({ average: 0.0, peak: 0.0 });
        this.renderLangStatus();
        this.serverStatus.onServerStatusChanged((state) =>
            this.renderServerStatus(state),
        );
        this.serverStatus.onCpuChanged((cpuInfo) =>
            this.renderServerCpu(cpuInfo),
        );
    }

    protected renderServerStatus(state: ServerBootStatus) {
        this.statusBar.setElement(SC_SERVER_STATE, {
            text: ScStatusBarContribution.textForServerStatus(state),
            alignment: StatusBarAlignment.LEFT,
            priority: 200,
            backgroundColor:
                state.status === "unresponsive"
                    ? "var(--theia-statusBarItem-warningBackground)"
                    : undefined,
            onclick: () => this.showServerMenu(state),
        });
    }

    protected renderLangStatus() {
        this.statusBar.setElement(SC_LANG_STATE, {
            text: ScStatusBarContribution.textForLangStatus(
                this.interpreterState,
            ),
            alignment: StatusBarAlignment.LEFT,
            priority: 300,
            backgroundColor:
                this.interpreterState.kind === "starting"
                    ? "var(--theia-statusBarItem-warningBackground)"
                    : undefined,
            onclick: () => this.showLangMenu(),
        });
    }

    protected renderServerCpu(cpuInfo: ServerCpuInfo) {
        this.statusBar.setElement(SC_SERVER_CPU, {
            text: `${cpuInfo.average} ${cpuInfo.peak}`,
            alignment: StatusBarAlignment.LEFT,
            priority: 100,
        });
    }

    protected static textForServerStatus(state: ServerBootStatus): string {
        switch (state.status) {
            case "offline":
                return "$(circle-slash) Server offline";
            case "booting":
                return `$(sync~spn) Server booting (${state.hostname}:${state.port})`;
            case "online":
                return `$(check) Server online (${state.hostname}:${state.port})`;
            case "unresponsive":
                return `$(warning) Server unresponsive`;
        }
    }

    protected static textForLangStatus(state: InterpreterState): string {
        switch (state.kind) {
            case "stopped":
                return "$(circle-slash) sclang stopped";
            case "starting":
                return `$(sync~spn) sclang starting`;
            case "running":
                return `$(check) sclang running`;
        }
    }

    protected async showServerMenu(state: ServerBootStatus): Promise<void> {
        let items: Array<QuickPickItem | QuickPickSeparator> = [
            { type: "separator", label: "Server" },
            { label: "$(debug-restart) Reboot server", execute: () => {} },
            { label: "$(debug-stop) Kill server", execute: () => {} },
            { label: "$(debug-stop) Kill all servers", execute: () => {} },
        ];
        if (state.status === "online") {
            items.push(
                { type: "separator", label: "Recording" },
                {
                    label: "$(record) Start recording",
                    description: "Writes to ~/Music/SuperCollider recordings",
                    execute: () => {},
                },
                {
                    label: "$(record) Start named recording",
                    description: "Writes to ~/Music/SuperCollider recordings",
                    execute: async () => {
                        const name = await this.quickInput.input({
                            prompt: "Recording name",
                            value: "my-sc-recording",
                        });
                        if (name === undefined) {
                            return;
                        }
                    },
                },
                { type: "separator", label: "Introspection" },
                { label: "Show server meter", execute: () => {} },
                { label: "Show scope", execute: () => {} },
                { label: "Show freqscope", execute: () => {} },
                { label: "Dump node tree", execute: () => {} },
                { label: "Dump node tree with controls", execute: () => {} },
                { label: "Show node tree", execute: () => {} },
                { label: "Server dump OSC", execute: () => {} },
            );
        }
        const picked = await this.quickInput.showQuickPick(items, {
            placeholder: "SuperCollider server",
        });
        picked?.execute?.();
    }

    protected async showLangMenu(): Promise<void> {
        let items: Array<QuickPickItem | QuickPickSeparator> = [
            { type: "separator", label: "Interpreter" },
        ];
        if (this.interpreterState.kind === "running") {
            items.push(
                {
                    label: "$(record) Recompile class library",
                    execute: () => {},
                },
                {
                    label: "$(debug-restart) Reboot interpreter",
                    execute: () => {},
                },
                { label: "$(debug-stop) Quit interpreter", execute: () => {} },
            );
        } else {
            items.push({
                label: "$(debug-start) Start interpreter",
                execute: () => {},
            });
        }
        const picked = await this.quickInput.showQuickPick(items, {
            placeholder: "sclang interpreter",
        });
        picked?.execute?.();
    }
}
