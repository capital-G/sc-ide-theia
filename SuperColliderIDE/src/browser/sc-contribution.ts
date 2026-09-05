import { injectable, inject } from "@theia/core/shared/inversify";
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MessageService,
} from "@theia/core/lib/common";
import { ScMethodRef, ScService } from "../common/protocol";
import {
    FrontendApplication,
    FrontendApplicationContribution,
    KeybindingContribution,
    KeybindingRegistry,
} from "@theia/core/lib/browser";
import { EditorManager, Range, TextEditor } from "@theia/editor/lib/browser";
import { evalRangeAt } from "./eval-region";
import { FlashDecoration } from "./sc-flash-decoration";
import { ScAutocomplete } from "./sc-autocomplete";
import { MonacoEditor } from "@theia/monaco/lib/browser/monaco-editor";

export const SclangStartCommand: Command = {
    id: "sclang.start",
    label: "Start sclang",
    category: "sclang",
};

export const SclangEvalTestCommand: Command = {
    id: "sclang.evalTest",
    label: "Eval sclang test",
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

export const ScStopServer: Command = {
    id: "sc.stopServer",
    label: "Stop server playback",
    category: "server",
};

export const ScQueryTestCommand: Command = {
    id: "sc.queryTest",
    label: "Query test: SinOsc class methods staring with a",
    category: "sclang",
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

    onDidInitializeLayout(app: FrontendApplication): void {
        this.scService.startInterpreter();
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(SclangStartCommand, {
            execute: () => {
                this.messageService.info("Starting sclang");
                this.scService.startInterpreter();
            },
        });

        registry.registerCommand(SclangEvalTestCommand, {
            execute: () => {
                this.messageService.info("Eval test");
                this.scService.evaluate("2+2");
            },
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
        });

        registry.registerCommand(ScStopServer, {
            execute: () => {
                this.scService.evaluate("CmdPeriod.run;", false);
            },
        });

        registry.registerCommand(ScQueryTestCommand, {
            execute: async () => {
                const refs = await this.scService.queryMethod(
                    "a",
                    "SinOsc",
                    "class",
                );
                this.messageService.info(
                    `${refs.length} refs: ${JSON.stringify(refs)}`,
                );
                if (refs.length > 0) {
                    const args = await this.scService.queryArgs(refs[0]);
                    this.messageService.info(
                        `args of ${refs[0].name}: ${JSON.stringify(args)}`,
                    );
                }
            },
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
