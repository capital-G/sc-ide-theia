import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { ScService } from '../common/protocol';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { EditorManager, Range, TextEditor } from '@theia/editor/lib/browser';
import { evalRangeAt } from './eval-region';
import { FlashDecoration } from './sc-flash-decoration';


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

export const SclangRecompileCommand : Command = {
    id: "sclang.recompile",
    label: "Recompile class library",
    category: "sclang",
}

export const ScStopServer : Command = {
    id: "sc.stopServer",
    label: "Stop server playback",
    category: "server",
}

@injectable()
export class ScCommandContribution implements CommandContribution, KeybindingContribution {
    @inject(ScService) protected readonly scService!: ScService;
    @inject(EditorManager) protected readonly editorManager!: EditorManager;
    @inject(MessageService) protected readonly messageService!: MessageService;
    @inject(FlashDecoration) protected readonly flash!: FlashDecoration;

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
                const editor = this.currentEditor();
                if (!editor) { return; }
                const codeSelection = this.getCodeSelection();
                if (!codeSelection?.code.trim()) { return; }
                this.scService.evaluate(codeSelection.code);
                this.flash.flash(editor, codeSelection.range, 300.0);
            }
        });

        registry.registerCommand(SclangRecompileCommand, {
            execute: () => this.scService.recompile()
        });

        registry.registerCommand(ScStopServer, {
            execute: () => {
                this.scService.evaluate("CmdPeriod.run;", false);
            }
        })
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: SclangEvalCommand.id,
            keybinding: 'ctrlcmd+enter',
            when: 'editorFocus',
        });

        keybindings.registerKeybinding({
            command: ScStopServer.id,
            keybinding: "cmd+.",
        });
    }

    protected currentEditor(): TextEditor | undefined {
        return this.editorManager.currentEditor?.editor;
    }

    protected getCodeSelection(): {code: string, range: Range } | undefined {
        const editor = this.currentEditor();
        if(!editor) { return undefined; }
        const document = editor.document;
        const selected = document.getText(editor.selection);
        if(selected) {
            return {
                code: selected,
                range: editor.selection,
            };
        } else {
            const text = document.getText();
            const range = evalRangeAt(text, document.offsetAt(editor.cursor));
            return {
                code: text.slice(range.start, range.end),
                range: Range.create(document.positionAt(range.start), document.positionAt(range.end)),
            }
        }
    }
}
