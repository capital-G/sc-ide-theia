import { Command, CommandContribution, CommandRegistry } from "@theia/core";
import { ApplicationShell, WidgetManager } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import {
    SC_AUDIO_SCOPE_FACTORY_ID,
    ScAudioScopeOptions,
    ScAudioScopeWidget,
    ScopeMode,
} from "./sc-audio-scope-widget";

const NEW_SCOPE_COMMANDS: [Command, ScopeMode][] = (
    [
        ["spectrum", "New Frequency Scope"],
        ["spectrogram", "New Spectrogram"],
        ["oscilloscope", "New Oscilloscope"],
        ["meters", "New Level Meters"],
    ] as const
).map(([mode, label]) => [
    { id: `sc.scope.new.${mode}`, label, category: "scsynth" },
    mode,
]);

/**
 * Each command opens another scope like an editor tab: the first one to the
 * right of the code, further ones below the last scope.
 */
@injectable()
export class ScAudioScopeContribution implements CommandContribution {
    @inject(WidgetManager) protected readonly widgetManager!: WidgetManager;
    @inject(ApplicationShell) protected readonly shell!: ApplicationShell;

    registerCommands(registry: CommandRegistry): void {
        for (const [command, mode] of NEW_SCOPE_COMMANDS) {
            registry.registerCommand(command, {
                execute: () => this.openScope(mode),
            });
        }
    }

    protected async openScope(mode: ScopeMode): Promise<ScAudioScopeWidget> {
        const scopes = this.widgetManager
            .getWidgets(SC_AUDIO_SCOPE_FACTORY_ID)
            .filter(
                (w): w is ScAudioScopeWidget => w instanceof ScAudioScopeWidget,
            );
        const used = new Set(scopes.map((w) => w.instance));
        let instance = 0;
        while (used.has(instance)) {
            instance++;
        }
        const options: ScAudioScopeOptions = { instance };
        const widget =
            await this.widgetManager.getOrCreateWidget<ScAudioScopeWidget>(
                SC_AUDIO_SCOPE_FACTORY_ID,
                options,
            );
        widget.setMode(mode);

        const last = scopes.filter((w) => w.isAttached).pop();
        const current = this.shell.currentWidget;
        await this.shell.addWidget(
            widget,
            last
                ? { area: "main", mode: "split-bottom", ref: last }
                : {
                      area: "main",
                      mode: "split-right",
                      ref:
                          current && this.shell.getAreaFor(current) === "main"
                              ? current
                              : undefined,
                  },
        );
        await this.shell.activateWidget(widget.id);
        return widget;
    }
}
