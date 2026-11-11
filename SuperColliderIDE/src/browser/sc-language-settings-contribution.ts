import { Command, CommandRegistry, MenuModelRegistry } from "@theia/core";
import {
    AbstractViewContribution,
    CommonMenus,
    FrontendApplicationContribution,
} from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import {
    SC_LANGUAGE_SETTINGS_WIDGET_ID,
    ScLanguageSettingsWidget,
} from "./sc-language-settings-widget";
import { ScNativeEnvironment } from "./sc-language-preferences";

export const ScLanguageSettingsCommand: Command = {
    id: "sc.languageSettings.open",
    label: "Language Settings",
    category: "sclang",
    iconClass: "codicon codicon-settings",
};

/**
 * A view w/ its own icon in the left bar, next to the explorer and the class library.
 * Also reachable from the gear menu and the command palette.
 */
@injectable()
export class ScLanguageSettingsContribution
    extends AbstractViewContribution<ScLanguageSettingsWidget>
    implements FrontendApplicationContribution
{
    @inject(ScNativeEnvironment)
    protected readonly environment!: ScNativeEnvironment;

    constructor() {
        super({
            widgetId: SC_LANGUAGE_SETTINGS_WIDGET_ID,
            widgetName: "Language Settings",
            // after the class library (150)
            defaultWidgetOptions: { area: "left", rank: 200 },
        });
    }

    /**
     * Adds the icon to the left bar w/o revealing the view - also after a layout
     * got restored, in which case initializeLayout is skipped.
     */
    async onDidInitializeLayout(): Promise<void> {
        if (this.environment.native) {
            await this.openView({ activate: false });
        }
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        // the wasm build has a fixed sclang, scsynth and class library
        if (!this.environment.native) {
            return;
        }
        registry.registerCommand(ScLanguageSettingsCommand, {
            execute: () => this.openView({ activate: true, reveal: true }),
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        if (!this.environment.native) {
            return;
        }
        menus.registerMenuAction(CommonMenus.MANAGE_SETTINGS, {
            commandId: ScLanguageSettingsCommand.id,
            label: "SuperCollider Language Settings",
            order: "z",
        });
    }
}
