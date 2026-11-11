import { Command, CommandRegistry, MenuModelRegistry } from "@theia/core";
import {
    AbstractViewContribution,
    FrontendApplicationContribution,
    KeybindingRegistry,
} from "@theia/core/lib/browser";
import {
    TabBarToolbarContribution,
    TabBarToolbarRegistry,
} from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { inject, injectable } from "@theia/core/shared/inversify";
import { EditorManager } from "@theia/editor/lib/browser";
import { EditorContextMenu } from "@theia/editor/lib/browser/editor-menu";
import { MonacoEditor } from "@theia/monaco/lib/browser/monaco-editor";
import { ScService } from "../common/protocol";
import { ScHelpTarget } from "../common/sc-help";
import { ScDefinitionProvider } from "./sc-definition";
import { symbolTarget } from "./sc-definition-target";
import { SC_LANGUAGE_ID } from "./sc-language-contribution";
import { SC_HELP_WIDGET_ID, ScHelpWidget } from "./sc-help-widget";

export const ScHelpForCursorCommand: Command = {
    id: "sc.help.forCursor",
    label: "Look Up Documentation for Cursor",
    category: "sclang",
};
export const ScHelpHomeCommand: Command = {
    id: "sc.help.home",
    label: "Help Home",
    category: "sclang",
    iconClass: "codicon codicon-home",
};
export const ScHelpBackCommand: Command = {
    id: "sc.help.back",
    label: "Help Back",
    category: "sclang",
    iconClass: "codicon codicon-arrow-left",
};
export const ScHelpForwardCommand: Command = {
    id: "sc.help.forward",
    label: "Help Forward",
    category: "sclang",
    iconClass: "codicon codicon-arrow-right",
};
export const ScHelpReloadCommand: Command = {
    id: "sc.help.reload",
    label: "Help Reload",
    category: "sclang",
    iconClass: "codicon codicon-refresh",
};
export const ScHelpSearchCommand: Command = {
    id: "sc.help.search",
    label: "Search Help",
    category: "sclang",
};

/** initial width of the help, the docs need some room for their code examples */
const HELP_WIDTH = 450;
/** below this window width the help would cover too much of the code */
const HELP_REVEAL_MIN_WINDOW_WIDTH = 1024;

/** help browser in the right side panel, like the help docklet of the Qt IDE */
@injectable()
export class ScHelpViewContribution
    extends AbstractViewContribution<ScHelpWidget>
    implements TabBarToolbarContribution, FrontendApplicationContribution
{
    @inject(ScService) protected readonly scService!: ScService;
    @inject(EditorManager) protected readonly editorManager!: EditorManager;
    @inject(ScDefinitionProvider)
    protected readonly definitions!: ScDefinitionProvider;

    constructor() {
        super({
            widgetId: SC_HELP_WIDGET_ID,
            widgetName: "Help",
            defaultWidgetOptions: { area: "right", rank: 600 },
            toggleCommandId: "supercollider.help.toggle",
        });
    }

    /**
     * Shows the help on the first visit, it is only called w/o a previous layout,
     * so a closed help stays closed afterwards.
     * On small screens, e.g. a phone, it only gets added collapsed to the side bar.
     */
    async initializeLayout(): Promise<void> {
        const windowWidth = window.innerWidth;
        const reveal = windowWidth >= HELP_REVEAL_MIN_WINDOW_WIDTH;
        await this.openView({ activate: false, reveal: false });
        // a collapsed panel keeps the size for when it gets expanded
        this.shell.resize(
            reveal
                ? Math.max(HELP_WIDTH, Math.round(windowWidth * 0.3))
                : Math.min(HELP_WIDTH, Math.round(windowWidth * 0.9)),
            "right",
        );
        if (reveal) {
            await this.openView({ activate: false, reveal: true });
        }
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(ScHelpForCursorCommand, {
            execute: () => this.helpForCursor(),
        });
        registry.registerCommand(ScHelpSearchCommand, {
            execute: async () =>
                (
                    await this.openView({ activate: true, reveal: true })
                ).focusSearch(),
        });
        const onWidget = (fn: (w: ScHelpWidget) => unknown) => ({
            execute: async () => fn(await this.openView({ reveal: true })),
            isVisible: (widget?: unknown) =>
                widget === undefined || widget instanceof ScHelpWidget,
        });
        registry.registerCommand(
            ScHelpHomeCommand,
            onWidget((w) => w.goHome()),
        );
        registry.registerCommand(
            ScHelpBackCommand,
            onWidget((w) => w.back()),
        );
        registry.registerCommand(
            ScHelpForwardCommand,
            onWidget((w) => w.forward()),
        );
        registry.registerCommand(
            ScHelpReloadCommand,
            onWidget((w) => w.reload()),
        );
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        // overrides monaco's add selection to next find match, but only for sclang
        keybindings.registerKeybinding({
            command: ScHelpForCursorCommand.id,
            keybinding: "ctrlcmd+d",
            when: `editorTextFocus && editorLangId == ${SC_LANGUAGE_ID}`,
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: ScHelpForCursorCommand.id,
            label: "Look Up Documentation",
            when: `editorLangId == ${SC_LANGUAGE_ID}`,
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        const items = [
            ScHelpBackCommand,
            ScHelpForwardCommand,
            ScHelpHomeCommand,
            ScHelpReloadCommand,
        ];
        items.forEach((command, priority) =>
            registry.registerItem({
                id: command.id,
                command: command.id,
                icon: command.iconClass,
                tooltip: command.label,
                priority,
                isVisible: (widget) => widget instanceof ScHelpWidget,
            }),
        );
    }

    async showHelp(target: ScHelpTarget): Promise<void> {
        const widget = await this.openView({ activate: false, reveal: true });
        await widget.showTarget(target);
    }

    /** same resolution as go to definition, falls back to the help home */
    protected async helpForCursor(): Promise<void> {
        const editor = MonacoEditor.getCurrent(this.editorManager);
        const control = editor?.getControl();
        const model = control?.getModel();
        const position = control?.getPosition();
        const word = position && model?.getWordAtPosition(position);
        if (!model || !position || !word) {
            (await this.openView({ reveal: true })).goHome();
            return;
        }
        const linePrefix = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
        });
        const target = symbolTarget(linePrefix, word.word);
        const { receiver, side } =
            target?.kind === "method"
                ? await this.definitions.resolveReceiver(target.receiver)
                : { receiver: undefined, side: undefined };
        const help = await this.scService.queryHelpFor(
            target?.name ?? word.word,
            receiver,
            side,
        );
        if (help) {
            await this.showHelp(help);
        }
    }
}
