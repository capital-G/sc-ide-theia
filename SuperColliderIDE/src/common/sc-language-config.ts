/**
 * The sclang language configuration, i.e. the `sclang_conf*.yaml` files of the
 * Qt IDE's interpreter settings, and how the native IDE launches sclang.
 * Not available in the wasm build, which has a fixed class library.
 */

export const SC_LANGUAGE_CONFIG_PATH = "/services/sclanguageconfig";
export const ScLanguageConfigService = Symbol("ScLanguageConfigService");

/** the keys sclang reads from its yaml config, see `SC_LanguageConfig.cpp` */
export interface ScLanguageConfig {
    includePaths: string[];
    excludePaths: string[];
    postInlineWarnings: boolean;
    excludeDefaultPaths: boolean;
}

export const DEFAULT_LANGUAGE_CONFIG: ScLanguageConfig = {
    includePaths: [],
    excludePaths: [],
    postInlineWarnings: false,
    excludeDefaultPaths: false,
};

/** `sclang_conf_<name>.yaml` */
export const SC_CONFIG_NAME_REGEX = /^[A-Za-z0-9_-]+$/;

export interface ScLanguageConfigInfo {
    platform: "darwin" | "linux" | "win32";
    /** the home directory, paths within it get shown as `~/...` */
    home: string;
    /** `Platform.userConfigDir` */
    configDir: string;
    /** `sclang_conf.yaml` within the config dir, used by sclang w/o `-l` */
    defaultConfigFile: string;
    /** all `sclang_conf*.yaml` within the config dir */
    configFiles: string[];
    /** the installation which gets used w/o an explicit one */
    detectedInstallation?: string;
    /** the sclang which gets launched with the options passed to `getInfo` */
    sclang?: string;
    /** the scsynth this sclang uses, unless overwritten */
    scsynth?: string;
}

export interface ScLanguageConfigService {
    /** `options` resolve the executables, see {@link ScLaunchOptions} */
    getInfo(options?: ScLaunchOptions): Promise<ScLanguageConfigInfo>;
    /** a missing file yields the defaults */
    read(path: string): Promise<ScLanguageConfig>;
    /** keeps comments and unknown keys of an existing file */
    write(path: string, config: ScLanguageConfig): Promise<void>;
    /** creates `sclang_conf_<name>.yaml` in the config dir and returns its path */
    create(name: string, config: ScLanguageConfig): Promise<string>;
    /** only `sclang_conf*.yaml` files within the config dir can be deleted */
    delete(path: string): Promise<void>;
}

/** how sclang gets launched, undefined values use the defaults */
export interface ScLaunchOptions {
    /**
     * The SuperCollider installation - the app bundle on macOS, the folder w/ sclang
     * otherwise. sclang uses the scsynth of its installation by default.
     */
    installation?: string;
    /** advanced, overwrites the sclang of the installation */
    sclangPath?: string;
    /** advanced, overwrites the scsynth of the installation via `Server.program` */
    scsynthPath?: string;
    /** passed as `-l`, sclang uses its default config file otherwise */
    configFile?: string;
    /** defaults to the home directory */
    cwd?: string;
}
