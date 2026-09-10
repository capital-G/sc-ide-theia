import {
    FrontendApplicationContribution,
    QuickInputService,
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
import {
    ScDumpNodeTree,
    ScDumpNodeTreeWithControls,
    ScKillAllServers,
    ScKillServer,
    SclangQuitCommand,
    SclangRebootCommand,
    SclangRecompileCommand,
    SclangStartCommand,
    ScRebootServer,
    ScServerDumpOSC,
    ScShowFreqScope,
    ScShowNodeTree,
    ScShowScope,
    ScShowServerMeter,
    ScStartNamedRecording,
    ScStartRecording,
    ScStopServer,
} from "./sc-contribution";
import { CommandRegistry } from "@theia/core";

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
    @inject(CommandRegistry) protected readonly commands!: CommandRegistry;

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
        const commands = [
            ScStopServer,
            ScRebootServer,
            ScKillServer,
            ScKillAllServers,
            ScShowServerMeter,
            ScShowScope,
            ScShowFreqScope,
            ScDumpNodeTree,
            ScDumpNodeTreeWithControls,
            ScShowNodeTree,
            ScServerDumpOSC,
            ScStartRecording,
            ScStartNamedRecording,
        ];

        const items = commands
            .filter((cmd) => this.commands.isEnabled(cmd.id))
            .map((cmd) => ({
                label: cmd.label!,
                execute: () => this.commands.executeCommand(cmd.id),
            }));

        const picked = await this.quickInput.showQuickPick(
            [{ type: "separator", label: "Server" }, ...items],
            { placeholder: "server" },
        );
        picked?.execute?.();
    }

    protected async showLangMenu(): Promise<void> {
        const commands = [
            SclangStartCommand,
            SclangRecompileCommand,
            SclangRebootCommand,
            SclangQuitCommand,
        ];

        const items = commands
            .filter((cmd) => this.commands.isEnabled(cmd.id))
            .map((cmd) => ({
                label: cmd.label!,
                execute: () => this.commands.executeCommand(cmd.id),
            }));

        const picked = await this.quickInput.showQuickPick(
            [{ type: "separator", label: "Interpreter" }, ...items],
            { placeholder: "sclang interpreter" },
        );
        picked?.execute?.();
    }
}
