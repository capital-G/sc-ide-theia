import {
    PreferenceContribution,
    PreferenceSchema,
    PreferenceSchemaService,
    PreferenceScope,
} from "@theia/core";
import { inject, injectable } from "@theia/core/shared/inversify";

/**
 * Whether the IDE launches a native sclang - the wasm build has a fixed sclang,
 * scsynth and class library, so it has no language settings.
 */
export const ScNativeEnvironment = Symbol("ScNativeEnvironment");
export interface ScNativeEnvironment {
    native: boolean;
}

export const SC_INSTALLATION_PREF = "supercollider.installation";
export const SC_SCLANG_PATH_PREF = "supercollider.sclang.path";
export const SC_SCSYNTH_PATH_PREF = "supercollider.scsynth.path";
export const SC_CONFIG_FILE_PREF = "supercollider.sclang.configFile";
export const SC_WORKING_DIR_PREF = "supercollider.sclang.workingDirectory";

export const SC_LAUNCH_PREFERENCES = [
    SC_INSTALLATION_PREF,
    SC_SCLANG_PATH_PREF,
    SC_SCSYNTH_PATH_PREF,
    SC_CONFIG_FILE_PREF,
    SC_WORKING_DIR_PREF,
];

const schema: PreferenceSchema = {
    // paths of the local machine, not of a project
    scope: PreferenceScope.User,
    properties: {
        [SC_INSTALLATION_PREF]: {
            type: "string",
            default: "",
            description:
                "The SuperCollider installation: SuperCollider.app on macOS, the folder containing sclang and scsynth otherwise. Empty uses SC_LANG_PATH or the default installation.",
        },
        [SC_SCLANG_PATH_PREF]: {
            type: "string",
            default: "",
            description:
                "Advanced: path of a sclang executable, overrides the one of the installation.",
        },
        [SC_SCSYNTH_PATH_PREF]: {
            type: "string",
            default: "",
            description:
                "Advanced: path of a scsynth executable, set as `Server.program`. Empty uses the scsynth of sclang's installation.",
        },
        [SC_CONFIG_FILE_PREF]: {
            type: "string",
            default: "",
            description:
                "The active sclang language configuration (`sclang_conf*.yaml`). Empty uses `sclang_conf.yaml` in `Platform.userConfigDir`.",
        },
        [SC_WORKING_DIR_PREF]: {
            type: "string",
            default: "",
            description:
                "Working directory of sclang. Empty uses the workspace root, or the home directory without a workspace.",
        },
    },
};

/** see the language settings page, which is a friendlier UI on top of these */
@injectable()
export class ScLanguagePreferenceContribution implements PreferenceContribution {
    @inject(ScNativeEnvironment)
    protected readonly environment!: ScNativeEnvironment;

    async initSchema(service: PreferenceSchemaService): Promise<void> {
        if (this.environment.native) {
            service.addSchema(schema);
        }
    }
}
