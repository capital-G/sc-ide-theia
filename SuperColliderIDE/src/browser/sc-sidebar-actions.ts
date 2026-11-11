import { CommandRegistry } from "@theia/core";
import {
    ApplicationShell,
    FrontendApplicationContribution,
} from "@theia/core/lib/browser";
import { PanelLayout, Widget } from "@theia/core/shared/@lumino/widgets";
import { inject, injectable } from "@theia/core/shared/inversify";
import { ScShowNodeTree } from "./sc-contribution";

interface ScSidebarAction {
    commandId: string;
    iconClass: string;
    title: string;
}

/**
 * Buttons in the left bar which run a command directly - e.g. to open another
 * scope, instead of toggling a view like the tabs above them.
 * Actions of commands which are not registered (e.g. the scopes outside the
 * wasm build) are left out.
 */
const ACTIONS: ScSidebarAction[] = [
    {
        // see ScAudioScopeContribution, only in the browser-only build
        commandId: "sc.scope.new.oscilloscope",
        iconClass: "codicon codicon-pulse",
        title: "New Oscilloscope",
    },
    {
        commandId: ScShowNodeTree.id,
        iconClass: "codicon codicon-type-hierarchy",
        title: "Show Node Tree",
    },
];

/** looks like the menus of the side bar, see `SidebarMenuWidget` */
class ScSidebarActionsWidget extends Widget {
    constructor(actions: ScSidebarAction[], run: (commandId: string) => void) {
        super();
        this.id = "sc-sidebar-actions";
        this.addClass("theia-sidebar-menu");
        this.addClass("sc-sidebar-actions");
        for (const action of actions) {
            const item = document.createElement("div");
            item.className = "theia-sidebar-menu-item";
            item.title = action.title;
            item.setAttribute("role", "button");
            item.setAttribute("aria-label", action.title);
            item.onclick = () => run(action.commandId);
            const icon = document.createElement("i");
            icon.className = action.iconClass;
            item.appendChild(icon);
            this.node.appendChild(item);
        }
    }
}

@injectable()
export class ScSidebarActions implements FrontendApplicationContribution {
    @inject(ApplicationShell) protected readonly shell!: ApplicationShell;
    @inject(CommandRegistry) protected readonly commands!: CommandRegistry;

    onDidInitializeLayout(): void {
        const actions = ACTIONS.filter((a) =>
            this.commands.getCommand(a.commandId),
        );
        if (actions.length === 0) {
            return;
        }
        // the column of the left bar: top menu, view tabs, overflow menu, bottom menu
        const handler = this.shell.leftPanelHandler;
        const layout = handler.bottomMenu.parent?.layout;
        if (!(layout instanceof PanelLayout)) {
            return;
        }
        const widget = new ScSidebarActionsWidget(actions, (id) =>
            this.commands.executeCommand(id),
        );
        // above the accounts and settings menus
        layout.insertWidget(layout.widgets.indexOf(handler.bottomMenu), widget);
    }
}
