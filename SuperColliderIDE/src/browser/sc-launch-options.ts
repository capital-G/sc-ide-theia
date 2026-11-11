import { PreferenceService } from "@theia/core";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { ScService } from "../common/protocol";
import { ScLaunchOptions } from "../common/sc-language-config";
import {
    SC_CONFIG_FILE_PREF,
    SC_INSTALLATION_PREF,
    SC_LAUNCH_PREFERENCES,
    SC_SCLANG_PATH_PREF,
    SC_SCSYNTH_PATH_PREF,
    SC_WORKING_DIR_PREF,
    ScNativeEnvironment,
} from "./sc-language-preferences";

/**
 * Keeps the launch options of the backend in sync with the preferences and the
 * workspace, they apply on the next (re)start of the interpreter.
 */
@injectable()
export class ScLaunchOptionsSync implements FrontendApplicationContribution {
    @inject(ScService) protected readonly scService!: ScService;
    @inject(PreferenceService)
    protected readonly preferences!: PreferenceService;
    @inject(WorkspaceService)
    protected readonly workspaceService!: WorkspaceService;
    @inject(ScNativeEnvironment)
    protected readonly environment!: ScNativeEnvironment;

    onStart(): void {
        if (!this.environment.native) {
            return;
        }
        this.preferences.onPreferenceChanged((change) => {
            if (SC_LAUNCH_PREFERENCES.includes(change.preferenceName)) {
                this.sync();
            }
        });
        this.workspaceService.onWorkspaceChanged(() => this.sync());
    }

    async options(): Promise<ScLaunchOptions> {
        await this.preferences.ready;
        const pref = (key: string) =>
            this.preferences.get<string>(key, "")?.trim() || undefined;
        const roots = await this.workspaceService.roots;
        const root = roots.find((r) => r.resource.scheme === "file");
        return {
            installation: pref(SC_INSTALLATION_PREF),
            sclangPath: pref(SC_SCLANG_PATH_PREF),
            scsynthPath: pref(SC_SCSYNTH_PATH_PREF),
            configFile: pref(SC_CONFIG_FILE_PREF),
            cwd: pref(SC_WORKING_DIR_PREF) ?? root?.resource.path.fsPath(),
        };
    }

    async sync(): Promise<void> {
        if (this.environment.native) {
            await this.scService.setLaunchOptions(await this.options());
        }
    }
}
