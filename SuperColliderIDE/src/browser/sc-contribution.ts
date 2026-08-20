import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { ScService } from '../common/protocol';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { EditorManager, TextEditor } from '@theia/editor/lib/browser';


export const SclangStartCommand : Command = {
    id: 'sclang.start',
    label: "Start sclang",
    category: "sclang",
}

export const SclangEvalTestCommand : Command = {
    id: "sclang.evalTest",
    label: "Eval sclang test",
    category: "sclang",
}

export const SclangEvalCommand : Command = {
    id: "sclang.eval",
    label: "Evaluate selection or line",
    category: "sclang",
}

@injectable()
export class ScCommandContribution implements CommandContribution, KeybindingContribution {
    @inject(ScService) protected readonly scService!: ScService;
    @inject(EditorManager) protected readonly editorManager!: EditorManager;
    @inject(MessageService) protected readonly messageService!: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(SclangStartCommand, {
            execute: () => {
                this.messageService.info('Starting sclang');
                this.scService.startInterpreter();
            }
        });
        
        registry.registerCommand(SclangEvalTestCommand, {
            execute: () => {
                this.messageService.info("Eval test");
                this.scService.evaluate("2+2");
            }
        })

        registry.registerCommand(SclangEvalCommand, {
            isEnabled: () => !!this.currentEditor(),
            execute: () => {
                const code = this.codeToEvaluate();
                if (code?.trim()) {
                    this.scService.evaluate(code);
                }
            }
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: SclangEvalCommand.id,
            keybinding: 'ctrlcmd+enter',
            when: 'editorFocus',
        });
    }

    protected currentEditor(): TextEditor | undefined {
        return this.editorManager.currentEditor?.editor;
    }

    protected codeToEvaluate(): string | undefined {
        const editor = this.currentEditor();
        if(!editor) { return undefined; }
        const { start, end } = editor.selection;
        const hasSelection = start.line !== end.line || start.character !== end.character;
        return hasSelection
            ? editor.document.getText(editor.selection)
            // apply offset b/c get line content is start counting at 1, not 0!
            : editor.document.getLineContent(editor.cursor.line + 1);
    }
}
