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
    ServerSynthInfo,
} from "./sc-server-status";
import { InterpreterState } from "../common/protocol";
import { ScClientImpl } from "./sc-client-impl";

export const SC_SERVER_STATE = "sc-server-state";
export const SC_SERVER_CPU = "sc-server-cpu";
export const SC_SERVER_SYNTH = "sc-server-synth";

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
        this.renderServerSynths({
            numGroups: 0,
            numSynthDefs: 0,
            numSynths: 0,
            numUGens: 0,
        });
        this.renderLangStatus();
        this.serverStatus.onServerStatusChanged((state) =>
            this.renderServerStatus(state),
        );
        this.serverStatus.onCpuChanged((cpuInfo) =>
            this.renderServerCpu(cpuInfo),
        );
        this.serverStatus.onServerInfoChanged((synthInfo) =>
            this.renderServerSynths(synthInfo),
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
            className: `sc-status sc-status--${state.status}`,
            tooltip: `Server status: ${state.status}${state.status == "online" ? ` (${state.hostname}:${state.port})` : ""}`,
        });
    }

    protected renderLangStatus() {
        this.statusBar.setElement(SC_LANG_STATE, {
            text: ScStatusBarContribution.textForLangStatus(
                this.interpreterState,
            ),
            alignment: StatusBarAlignment.LEFT,
            priority: 300,
            onclick: () => this.showLangMenu(),
            className: `sc-status sc-status--${this.interpreterState.kind}`,
            tooltip: `Interpreter status: ${this.interpreterState.kind}`,
        });
    }

    protected renderServerCpu(cpuInfo: ServerCpuInfo) {
        const text =
            this.serverStatus.state.status === "offline"
                ? ""
                : `${cpuInfo.average.toFixed(1).padStart(5)}% / ${cpuInfo.peak.toFixed(1).padStart(5)}%`;
        this.statusBar.setElement(SC_SERVER_CPU, {
            text,
            alignment: StatusBarAlignment.LEFT,
            priority: 100,
            tooltip: `CPU: average ${cpuInfo.average.toFixed(2)}%, peak: ${cpuInfo.peak.toFixed(2)}%`,
            className: "sc-cpu",
        });
    }

    protected renderServerSynths(synthInfo: ServerSynthInfo) {
        const text =
            this.serverStatus.state.status === "offline"
                ? ""
                : `${synthInfo.numUGens.toFixed(0).padStart(5)}u ${synthInfo.numSynths.toFixed(0).padStart(5)}s ${synthInfo.numGroups.toFixed(0).padStart(5)}g ${synthInfo.numSynthDefs.toFixed(0).padStart(5)}d`;
        this.statusBar.setElement(SC_SERVER_SYNTH, {
            text,
            alignment: StatusBarAlignment.LEFT,
            priority: 50,
            tooltip: `${synthInfo.numUGens} UGens, ${synthInfo.numSynths} Synths, ${synthInfo.numGroups} Groups, ${synthInfo.numSynthDefs} SynthDefs`,
            className: "sc-synth-info",
        });
    }

    protected static textForServerStatus(state: ServerBootStatus): string {
        switch (state.status) {
            case "offline":
                return "$(circle-slash) Server";
            case "booting":
                return `$(sync~spn) Server`;
            case "online":
                return `$(circle-filled) Server`;
            case "unresponsive":
                return `$(warning) Server`;
        }
    }

    protected static textForLangStatus(state: InterpreterState): string {
        switch (state.kind) {
            case "stopped":
                return "$(circle-slash) sclang";
            case "booting":
                return `$(sync~spn) sclang`;
            case "running":
                return `$(circle-filled) sclang`;
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
