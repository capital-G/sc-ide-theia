import { injectable, inject } from "@theia/core/shared/inversify";
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MessageService,
    QuickInputService,
} from "@theia/core/lib/common";
import { FileDialogService } from "@theia/filesystem/lib/browser";
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { ScMethodRef, ScService } from "../common/protocol";
import {
    FrontendApplicationContribution,
    KeybindingContribution,
    KeybindingRegistry,
} from "@theia/core/lib/browser";
import { EditorManager, Range, TextEditor } from "@theia/editor/lib/browser";
import { evalRangeAt } from "./eval-region";
import { FlashDecoration } from "./sc-flash-decoration";
import { ScAutocomplete } from "./sc-autocomplete";
import { MonacoEditor } from "@theia/monaco/lib/browser/monaco-editor";
import { ScClientImpl } from "./sc-client-impl";

export const SclangStartCommand: Command = {
    id: "sclang.start",
    label: "Start sclang",
    category: "sclang",
};

export const SclangEvalCommand: Command = {
    id: "sclang.eval",
    label: "Evaluate selection or line",
    category: "sclang",
};

export const SclangRecompileCommand: Command = {
    id: "sclang.recompile",
    label: "Recompile class library",
    category: "sclang",
};

export const SclangRebootCommand: Command = {
    id: "sclang.reboot",
    label: "Reboot interpreter",
    category: "sclang",
};

export const SclangQuitCommand: Command = {
    id: "sclang.quit",
    label: "Quit interpreter",
    category: "sclang",
};

export const ScStopServer: Command = {
    id: "sc.stopServer",
    label: "Stop server playback",
    category: "server",
};

export const ScRebootServer: Command = {
    id: "sc.rebootServer",
    label: "$(debug-restart) Reboot server",
    category: "server",
};

export const ScKillServer: Command = {
    id: "sc.killServer",
    label: "$(debug-stop) Kill server",
    category: "server",
};

export const ScKillAllServers: Command = {
    id: "sc.killAllServers",
    label: "$(debug-stop) Kill all servers",
    category: "server",
};

export const ScShowServerMeter: Command = {
    id: "sc.showServerMeter",
    label: "Show server meter",
    category: "server",
};

export const ScShowScope: Command = {
    id: "sc.showScope",
    label: "Show scope",
    category: "server",
};

export const ScShowFreqScope: Command = {
    id: "sc.showFreqScope",
    label: "Show freqscope",
    category: "server",
};

export const ScDumpNodeTree: Command = {
    id: "sc.dumpNodeTree",
    label: "Dump node tree",
    category: "server",
};

export const ScDumpNodeTreeWithControls: Command = {
    id: "sc.dumpNodeTreeWithControls",
    label: "Dump node tree with controls",
    category: "server",
};

export const ScShowNodeTree: Command = {
    id: "sc.showNodeTree",
    label: "Show node tree",
    category: "server",
};

export const ScServerDumpOSC: Command = {
    id: "sc.serverDumpOSC",
    label: "Server dump OSC",
    category: "server",
};

export const ScStartRecording: Command = {
    id: "sc.startRecording",
    label: "Start recording",
};

export const ScStartNamedRecording: Command = {
    id: "sc.startNamedRecording",
    label: "Start recording at path ...",
};

export const ScRememberImplCommand: Command = {
    id: "sc.rememberImpl",
    label: "Remember picked implementation",
    category: "sclang",
};

export const ScCycleArgNameCommand: Command = {
    id: "sc.cycleArgName",
    label: "Cycle to the next keyword argument",
    category: "sclang",
};

export const ScCycleArgNameBackCommand: Command = {
    id: "sc.cycleArgNameBack",
    label: "Cycle to the previous keyword argument",
    category: "sclang",
};

@injectable()
export class ScCommandContribution
    implements
        CommandContribution,
        KeybindingContribution,
        FrontendApplicationContribution
{
    @inject(ScService) protected readonly scService!: ScService;
    @inject(EditorManager) protected readonly editorManager!: EditorManager;
    @inject(MessageService) protected readonly messageService!: MessageService;
    @inject(FlashDecoration) protected readonly flash!: FlashDecoration;
    @inject(ScAutocomplete) protected readonly autocomplete!: ScAutocomplete;
    @inject(ScClientImpl) protected readonly client!: ScClientImpl;
    @inject(QuickInputService)
    protected readonly quickInput!: QuickInputService;
    @inject(FileDialogService)
    protected readonly fileDialog!: FileDialogService;
    @inject(WorkspaceService)
    protected readonly workspaceService!: WorkspaceService;

    onDidInitializeLayout(): void {
        this.scService.startInterpreter();
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(SclangStartCommand, {
            execute: () => {
                this.messageService.info("Starting sclang");
                this.scService.startInterpreter();
            },
            isEnabled: () => this.client.state.kind === "stopped",
        });

        registry.registerCommand(SclangEvalCommand, {
            isEnabled: () => !!this.currentEditor(),
            execute: () => {
                const editor = this.currentEditor();
                if (!editor) {
                    return;
                }
                const codeSelection = this.getCodeSelection();
                if (!codeSelection?.code.trim()) {
                    return;
                }
                this.scService.evaluate(codeSelection.code);
                this.flash.flash(editor, codeSelection.range, 300.0);
            },
        });

        registry.registerCommand(SclangRecompileCommand, {
            execute: () => this.scService.recompile(),
            isEnabled: () => this.client.state.kind !== "stopped",
        });

        registry.registerCommand(SclangRebootCommand, {
            execute: () => {
                this.scService.restartInterpreter();
            },
            isEnabled: () => this.client.state.kind !== "stopped",
        });

        registry.registerCommand(SclangQuitCommand, {
            execute: () => {},
            isEnabled: () => this.client.state.kind !== "stopped",
        });

        registry.registerCommand(ScStopServer, {
            execute: () => {
                this.scService.evaluate("CmdPeriod.run;", false);
            },
        });

        registry.registerCommand(ScRebootServer, {
            execute: () => {
                this.scService.evaluate("Server.default.reboot;", false);
            },
            isEnabled: () => this.client.state.kind === "running",
        });

        registry.registerCommand(ScKillServer, {
            execute: () => {
                this.scService.evaluate("Server.default.quit;", false);
            },
            isEnabled: () => this.client.state.kind === "running",
        });

        registry.registerCommand(ScKillAllServers, {
            execute: () => {
                // @todo
            },
        });

        registry.registerCommand(ScShowServerMeter, {
            execute: () => {
                this.scService.evaluate("Server.default.meter", false);
            },
            isEnabled: () => this.client.state.kind === "running",
        });

        registry.registerCommand(ScShowScope, {
            execute: () => {
                this.scService.evaluate("Server.default.scope", false);
            },
            isEnabled: () => this.client.state.kind === "running",
        });

        registry.registerCommand(ScShowFreqScope, {
            execute: () => {
                // @todo
            },
            isEnabled: () => false,
        });

        registry.registerCommand(ScDumpNodeTree, {
            execute: () => {
                // @todo
            },
            isEnabled: () => false,
        });

        registry.registerCommand(ScDumpNodeTreeWithControls, {
            execute: () => {
                // @todo
            },
            isEnabled: () => false,
        });

        registry.registerCommand(ScShowNodeTree, {
            execute: () => {
                // @todo
            },
            isEnabled: () => false,
        });

        registry.registerCommand(ScServerDumpOSC, {
            execute: () => {
                // @todo
            },
            isEnabled: () => false,
        });

        registry.registerCommand(ScStartRecording, {
            execute: () => {
                this.scService.evaluate("Server.default.record;", false);
            },
            isEnabled: () => this.client.state.kind === "running",
        });

        registry.registerCommand(ScStartNamedRecording, {
            execute: async () => {
                const root = this.workspaceService.tryGetRoots()[0];
                const uri = await this.fileDialog.showSaveDialog(
                    {
                        title: "Start recording",
                        saveLabel: "Record",
                        inputValue: "sc-recording.wav",
                        filters: { Audio: ["wav", "aiff", "flac"] },
                    },
                    root,
                );
                if (!uri) {
                    return;
                }
                // @todo...
            },
            isEnabled: () => this.client.state.kind === "running",
        });

        registry.registerCommand(ScRememberImplCommand, {
            execute: (ref: ScMethodRef, uri: string) =>
                this.autocomplete.remember(uri, ref),
        });

        // capture tab only if a signature is displayed
        registry.registerCommand(ScCycleArgNameCommand, {
            isEnabled: () => !!this.autocomplete.activeHelp,
            execute: () => {
                const editor = MonacoEditor.getCurrent(this.editorManager);
                if (editor) {
                    this.autocomplete.cycleArgName(editor, true);
                }
            },
        });

        registry.registerCommand(ScCycleArgNameBackCommand, {
            isEnabled: () => !!this.autocomplete.activeHelp,
            execute: () => {
                const editor = MonacoEditor.getCurrent(this.editorManager);
                if (editor) {
                    this.autocomplete.cycleArgName(editor, false);
                }
            },
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: SclangEvalCommand.id,
            keybinding: "ctrlcmd+enter",
            when: "editorFocus",
        });

        keybindings.registerKeybinding({
            command: ScStopServer.id,
            keybinding: "cmd+.",
        });

        keybindings.registerKeybinding({
            command: ScCycleArgNameCommand.id,
            keybinding: "tab",
            when: "editorTextFocus && parameterHintsVisible && !suggestWidgetVisible && !inSnippetMode",
        });

        keybindings.registerKeybinding({
            command: ScCycleArgNameBackCommand.id,
            keybinding: "shift+tab",
            when: "editorTextFocus && parameterHintsVisible && !suggestWidgetVisible && !inSnippetMode",
        });
    }

    protected currentEditor(): TextEditor | undefined {
        return this.editorManager.currentEditor?.editor;
    }

    protected getCodeSelection(): { code: string; range: Range } | undefined {
        const editor = this.currentEditor();
        if (!editor) {
            return undefined;
        }
        const document = editor.document;
        const selected = document.getText(editor.selection);
        if (selected) {
            return {
                code: selected,
                range: editor.selection,
            };
        } else {
            const text = document.getText();
            const range = evalRangeAt(text, document.offsetAt(editor.cursor));
            return {
                code: text.slice(range.start, range.end),
                range: Range.create(
                    document.positionAt(range.start),
                    document.positionAt(range.end),
                ),
            };
        }
    }
}
