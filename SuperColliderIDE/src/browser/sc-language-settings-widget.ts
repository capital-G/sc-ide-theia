import {
    MessageService,
    PreferenceScope,
    PreferenceService,
    QuickInputService,
    URI,
} from "@theia/core";
import { BaseWidget, ConfirmDialog, Message } from "@theia/core/lib/browser";
import {
    inject,
    injectable,
    postConstruct,
} from "@theia/core/shared/inversify";
import { FileDialogService } from "@theia/filesystem/lib/browser";
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { ScService } from "../common/protocol";
import {
    DEFAULT_LANGUAGE_CONFIG,
    SC_CONFIG_NAME_REGEX,
    ScLanguageConfig,
    ScLanguageConfigInfo,
    ScLanguageConfigService,
    ScLaunchOptions,
} from "../common/sc-language-config";
import {
    SC_CONFIG_FILE_PREF,
    SC_INSTALLATION_PREF,
    SC_SCLANG_PATH_PREF,
    SC_SCSYNTH_PATH_PREF,
    SC_WORKING_DIR_PREF,
} from "./sc-language-preferences";
import { ScLaunchOptionsSync } from "./sc-launch-options";

export const SC_LANGUAGE_SETTINGS_WIDGET_ID = "sc-language-settings";

/** the IDE side, stored as user preferences */
interface ScPaths {
    installation: string;
    sclangPath: string;
    scsynthPath: string;
    workingDirectory: string;
}

const PATH_PREFS: Record<keyof ScPaths, string> = {
    installation: SC_INSTALLATION_PREF,
    sclangPath: SC_SCLANG_PATH_PREF,
    scsynthPath: SC_SCSYNTH_PATH_PREF,
    workingDirectory: SC_WORKING_DIR_PREF,
};

type PathListKey = "includePaths" | "excludePaths";
type FlagKey = "postInlineWarnings" | "excludeDefaultPaths";

const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);

/** the options which determine the executables */
const executables = (paths: ScPaths): ScLaunchOptions => ({
    installation: paths.installation.trim() || undefined,
    sclangPath: paths.sclangPath.trim() || undefined,
    scsynthPath: paths.scsynthPath.trim() || undefined,
});

interface BrowseOptions {
    files?: boolean;
    folders?: boolean;
    many?: boolean;
}

const clone = (config: ScLanguageConfig): ScLanguageConfig => ({
    ...config,
    includePaths: [...config.includePaths],
    excludePaths: [...config.excludePaths],
});

/** creates an element w/ properties and children */
function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> = {},
    ...children: (Node | string | false | undefined)[]
): HTMLElementTagNameMap[K] {
    const element = Object.assign(document.createElement(tag), props);
    for (const child of children) {
        if (child !== false && child !== undefined) {
            element.append(child);
        }
    }
    return element;
}

/**
 * The interpreter settings of the Qt IDE: the active `sclang_conf*.yaml` and its
 * options, plus the executables and the working directory of sclang.
 * Edits are pending until they get applied.
 */
@injectable()
export class ScLanguageSettingsWidget extends BaseWidget {
    @inject(ScLanguageConfigService)
    protected readonly configService!: ScLanguageConfigService;
    @inject(ScService) protected readonly scService!: ScService;
    @inject(PreferenceService)
    protected readonly preferences!: PreferenceService;
    @inject(FileDialogService)
    protected readonly fileDialog!: FileDialogService;
    @inject(QuickInputService)
    protected readonly quickInput!: QuickInputService;
    @inject(MessageService) protected readonly messages!: MessageService;
    @inject(WorkspaceService)
    protected readonly workspaceService!: WorkspaceService;
    @inject(ScLaunchOptionsSync)
    protected readonly launchOptions!: ScLaunchOptionsSync;

    protected info: ScLanguageConfigInfo | undefined;
    protected workspaceRoot: string | undefined;
    /** the config file shown in the form, it becomes active on apply */
    protected selectedFile = "";
    protected activeFile = "";
    protected config: ScLanguageConfig = { ...DEFAULT_LANGUAGE_CONFIG };
    protected savedConfig: ScLanguageConfig = { ...DEFAULT_LANGUAGE_CONFIG };
    protected paths: ScPaths = {
        installation: "",
        sclangPath: "",
        scsynthPath: "",
        workingDirectory: "",
    };
    protected savedPaths: ScPaths = { ...this.paths };
    protected error: string | undefined;
    /** the separate sclang and scsynth, open if one of them is set */
    protected advancedOpen: boolean | undefined;

    protected page!: HTMLElement;
    protected footerButtons: HTMLButtonElement[] = [];

    @postConstruct()
    protected init(): void {
        this.id = SC_LANGUAGE_SETTINGS_WIDGET_ID;
        this.title.label = "Language Settings";
        this.title.caption = "SuperCollider Language Settings";
        this.title.iconClass = "codicon codicon-settings";
        this.title.closable = true;
        this.addClass("sc-language-settings");
        this.node.tabIndex = 0;
        this.page = h("div", { className: "sc-language-settings-page" });
        this.node.appendChild(this.page);
        this.reload();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
        // e.g. preferences changed in settings.json meanwhile
        if (!this.dirty) {
            this.reload();
        }
    }

    get dirty(): boolean {
        return (
            this.selectedFile !== this.activeFile ||
            !same(this.config, this.savedConfig) ||
            !same(this.paths, this.savedPaths)
        );
    }

    protected async reload(): Promise<void> {
        try {
            await this.preferences.ready;
            const roots = await this.workspaceService.roots;
            this.workspaceRoot = roots
                .find((r) => r.resource.scheme === "file")
                ?.resource.path.fsPath();
            const pref = (key: string) =>
                this.preferences.get<string>(key, "") ?? "";
            this.paths = {
                installation: pref(SC_INSTALLATION_PREF),
                sclangPath: pref(SC_SCLANG_PATH_PREF),
                scsynthPath: pref(SC_SCSYNTH_PATH_PREF),
                workingDirectory: pref(SC_WORKING_DIR_PREF),
            };
            this.savedPaths = { ...this.paths };
            this.advancedOpen ??= !!(
                this.paths.sclangPath || this.paths.scsynthPath
            );
            this.info = await this.configService.getInfo(
                executables(this.paths),
            );
            this.activeFile =
                pref(SC_CONFIG_FILE_PREF) || this.info.defaultConfigFile;
            await this.load(this.activeFile);
            this.error = undefined;
        } catch (e) {
            this.error = String(e);
        }
        this.render();
    }

    /** shows a config file in the form */
    protected async load(file: string): Promise<void> {
        this.selectedFile = file;
        this.config = await this.configService.read(file);
        this.savedConfig = clone(this.config);
        this.render();
    }

    protected get configFiles(): string[] {
        const files = new Set(this.info?.configFiles ?? []);
        for (const file of [
            this.info?.defaultConfigFile,
            this.activeFile,
            this.selectedFile,
        ]) {
            if (file) {
                files.add(file);
            }
        }
        return [...files].sort();
    }

    protected async selectFile(file: string): Promise<void> {
        if (
            !same(this.config, this.savedConfig) &&
            !(await this.confirm(
                "Discard Changes",
                "The configuration has changes which were not applied. Discard them?",
            ))
        ) {
            this.render();
            return;
        }
        await this.load(file);
    }

    protected async newFile(): Promise<void> {
        const name = await this.quickInput.input({
            title: "New Language Configuration",
            prompt: "Creates 'sclang_conf_<name>.yaml' with the current options",
            validateInput: async (value) =>
                SC_CONFIG_NAME_REGEX.test(value)
                    ? undefined
                    : "Only letters, digits, '_' and '-'",
        });
        if (!name) {
            return;
        }
        try {
            const file = await this.configService.create(name, this.config);
            this.info = await this.configService.getInfo();
            await this.load(file);
        } catch (e) {
            this.messages.error(String(e));
        }
    }

    protected async deleteFile(): Promise<void> {
        const file = this.selectedFile;
        if (
            !(await this.confirm(
                "Delete Configuration File",
                `Delete ${file}? This can not be undone.`,
            ))
        ) {
            return;
        }
        try {
            await this.configService.delete(file);
            if (file === this.activeFile) {
                // sclang falls back to its default config
                await this.preferences.set(
                    SC_CONFIG_FILE_PREF,
                    "",
                    PreferenceScope.User,
                );
                this.activeFile = this.info!.defaultConfigFile;
                await this.launchOptions.sync();
            }
            this.info = await this.configService.getInfo();
            await this.load(this.activeFile);
        } catch (e) {
            this.messages.error(String(e));
        }
    }

    protected async browse(
        title: string,
        { files = false, folders = false, many = false }: BrowseOptions,
    ): Promise<string[] | undefined> {
        const uris: URI | URI[] | undefined =
            await this.fileDialog.showOpenDialog({
                title,
                canSelectFiles: files,
                canSelectFolders: folders,
                canSelectMany: many,
            });
        if (!uris) {
            return undefined;
        }
        return (Array.isArray(uris) ? uris : [uris]).map((uri) =>
            uri.path.fsPath(),
        );
    }

    protected async browsePath(key: keyof ScPaths): Promise<void> {
        const [title, options]: [string, BrowseOptions] =
            key === "installation"
                ? this.info?.platform === "darwin"
                    ? // an app bundle is a folder, but shown like a file
                      ["SuperCollider.app", { files: true, folders: true }]
                    : ["SuperCollider Folder", { folders: true }]
                : key === "workingDirectory"
                  ? ["Working Directory", { folders: true }]
                  : [
                        key === "sclangPath" ? "sclang" : "scsynth",
                        { files: true },
                    ];
        const selected = await this.browse(title, options);
        if (selected?.length) {
            this.paths = { ...this.paths, [key]: selected[0] };
            this.render();
        }
    }

    protected async addPaths(key: PathListKey): Promise<void> {
        const selected = await this.browse(
            key === "includePaths"
                ? "Include Directories"
                : "Exclude Directories",
            { folders: true, many: true },
        );
        if (selected?.length) {
            const paths = [...this.config[key]];
            for (const path of selected) {
                if (!paths.includes(path)) {
                    paths.push(path);
                }
            }
            this.config = { ...this.config, [key]: paths };
            this.render();
        }
    }

    protected removePath(key: PathListKey, index: number): void {
        this.config = {
            ...this.config,
            [key]: this.config[key].filter((_, i) => i !== index),
        };
        this.render();
    }

    protected async apply(): Promise<void> {
        try {
            if (!same(this.config, this.savedConfig)) {
                await this.configService.write(this.selectedFile, this.config);
            }
            const configPref =
                this.selectedFile === this.info?.defaultConfigFile
                    ? ""
                    : this.selectedFile;
            const updates: [string, string][] = [
                [SC_CONFIG_FILE_PREF, configPref],
                ...(Object.keys(PATH_PREFS) as (keyof ScPaths)[]).map(
                    (key): [string, string] => [
                        PATH_PREFS[key],
                        this.paths[key].trim(),
                    ],
                ),
            ];
            for (const [key, value] of updates) {
                if ((this.preferences.get<string>(key, "") ?? "") !== value) {
                    await this.preferences.set(
                        key,
                        value,
                        PreferenceScope.User,
                    );
                }
            }
            await this.launchOptions.sync();
        } catch (e) {
            this.messages.error(`Could not apply the language settings: ${e}`);
            return;
        }
        this.activeFile = this.selectedFile;
        this.savedConfig = clone(this.config);
        this.savedPaths = { ...this.paths };
        try {
            // the placeholders of the executables
            this.info = await this.configService.getInfo(
                executables(this.paths),
            );
        } catch {
            // keep the previous info
        }
        this.render();

        const reboot = "Reboot Interpreter";
        const answer = await this.messages.info(
            "The language settings have been updated. The interpreter needs a reboot to apply them, which stops all sound.",
            reboot,
        );
        if (answer === reboot) {
            await this.scService.restartInterpreter();
        }
    }

    protected async revert(): Promise<void> {
        this.paths = { ...this.savedPaths };
        await this.load(this.activeFile);
    }

    protected async confirm(title: string, msg: string): Promise<boolean> {
        return !!(await new ConfirmDialog({ title, msg }).open());
    }

    // --- rendering ---

    /** rebuilds the page, text inputs only update the footer while typing */
    protected render(): void {
        this.footerButtons = [];
        if (this.error) {
            this.page.replaceChildren(
                h("div", {
                    className: "sc-language-settings-error",
                    textContent: this.error,
                }),
            );
            return;
        }
        const info = this.info;
        if (!info) {
            this.page.replaceChildren(
                h("div", {
                    className: "sc-language-settings-loading",
                    textContent: "Loading…",
                }),
            );
            return;
        }
        this.page.replaceChildren(
            h("h2", { textContent: "Interpreter" }),
            this.renderPath(
                "installation",
                info.platform === "darwin"
                    ? "SuperCollider.app"
                    : "SuperCollider folder",
                info.detectedInstallation ??
                    "Not found - choose the SuperCollider installation",
            ),
            this.renderPath(
                "workingDirectory",
                "Working directory",
                this.workspaceRoot
                    ? `Workspace root (${this.workspaceRoot})`
                    : "Home directory",
            ),
            this.renderAdvanced(info),
            h("h2", { textContent: "Language Configuration" }),
            this.renderConfigFile(),
            this.renderPathList("includePaths", "Include paths"),
            this.renderPathList("excludePaths", "Exclude paths"),
            this.renderCheckbox("postInlineWarnings", "Post inline warnings"),
            this.renderCheckbox(
                "excludeDefaultPaths",
                "Exclude default paths (the extension directories)",
            ),
            this.renderFooter(),
        );
    }

    /** separate executables, e.g. of a development build */
    protected renderAdvanced(info: ScLanguageConfigInfo): HTMLElement {
        const details: HTMLDetailsElement = h(
            "details",
            {
                className: "sc-language-settings-advanced",
                open: !!this.advancedOpen,
                ontoggle: () => (this.advancedOpen = details.open),
            },
            h("summary", { textContent: "Advanced" }),
            h("p", {
                className: "sc-language-settings-hint",
                textContent:
                    "Separate executables, e.g. of a development build. They override the ones of the installation.",
            }),
            this.renderPath(
                "sclangPath",
                "sclang",
                info.sclang ?? "The sclang of the installation",
            ),
            this.renderPath(
                "scsynthPath",
                "scsynth",
                info.scsynth ?? "The scsynth of sclang's installation",
            ),
        );
        return details;
    }

    protected row(label: string, field: HTMLElement, id?: string): HTMLElement {
        return h(
            "div",
            { className: "sc-language-settings-row" },
            h("label", { textContent: label, htmlFor: id ?? "" }),
            field,
        );
    }

    protected button(
        label: string,
        onclick: () => unknown,
        secondary = true,
    ): HTMLButtonElement {
        return h("button", {
            className: `theia-button ${secondary ? "secondary" : "main"}`,
            textContent: label,
            onclick,
        });
    }

    protected renderPath(
        key: keyof ScPaths,
        label: string,
        placeholder: string,
    ): HTMLElement {
        const id = `sc-path-${key}`;
        const input = h("input", {
            id,
            className: "theia-input",
            type: "text",
            spellcheck: false,
            value: this.paths[key],
            placeholder,
            oninput: () => {
                this.paths = { ...this.paths, [key]: input.value };
                this.updateFooter();
            },
        });
        return this.row(
            label,
            h(
                "div",
                { className: "sc-language-settings-field" },
                input,
                this.button("Browse…", () => this.browsePath(key)),
            ),
            id,
        );
    }

    /** a path for reading, the home directory as `~` */
    protected display(path: string): string {
        const home = this.info?.home;
        if (!home || !path.startsWith(home)) {
            return path;
        }
        // only a whole directory, i.e. not /Users/me2 for /Users/me
        const rest = path.slice(home.length);
        return rest === "" || /^[\\/]/.test(rest) ? `~${rest}` : path;
    }

    protected renderConfigFile(): HTMLElement {
        const id = "sc-config-file";
        const select: HTMLSelectElement = h(
            "select",
            {
                id,
                className: "theia-select",
                onchange: () => this.selectFile(select.value),
            },
            ...this.configFiles.map((file) => {
                // all of them are within the config dir, shown below
                const name = this.configDir(file)
                    ? file.split(/[\\/]/).pop()!
                    : this.display(file);
                return h("option", {
                    value: file,
                    title: file,
                    textContent:
                        file === this.activeFile ? `${name} (active)` : name,
                    selected: file === this.selectedFile,
                });
            }),
        );
        return this.row(
            "Active config file",
            h(
                "div",
                { className: "sc-language-settings-field" },
                select,
                this.button("New…", () => this.newFile()),
                this.button("Delete", () => this.deleteFile()),
                h("div", {
                    className: "sc-language-settings-hint",
                    textContent: `in ${this.display(this.info?.configDir ?? "")}`,
                    title: this.info?.configDir ?? "",
                }),
            ),
            id,
        );
    }

    /** whether a file is directly within the config dir */
    protected configDir(file: string): boolean {
        const dir = this.info?.configDir;
        return (
            !!dir &&
            file.startsWith(dir) &&
            /^[\\/][^\\/]+$/.test(file.slice(dir.length))
        );
    }

    protected renderPathList(key: PathListKey, label: string): HTMLElement {
        const paths = this.config[key];
        return this.row(
            label,
            h(
                "div",
                { className: "sc-language-settings-list" },
                paths.length === 0 &&
                    h("div", {
                        className: "sc-language-settings-empty",
                        textContent: "None",
                    }),
                ...paths.map((path, i) =>
                    h(
                        "div",
                        { className: "sc-language-settings-list-item" },
                        h("span", {
                            textContent: this.display(path),
                            title: path,
                        }),
                        h("button", {
                            className:
                                "codicon codicon-close sc-language-settings-icon",
                            title: "Remove",
                            onclick: () => this.removePath(key, i),
                        }),
                    ),
                ),
                this.button("Add Folder…", () => this.addPaths(key)),
            ),
        );
    }

    protected renderCheckbox(key: FlagKey, label: string): HTMLElement {
        const checkbox = h("input", {
            type: "checkbox",
            className: "theia-input",
            checked: this.config[key],
            onchange: () => {
                this.config = { ...this.config, [key]: checkbox.checked };
                this.updateFooter();
            },
        });
        return h(
            "div",
            { className: "sc-language-settings-row" },
            h("span"),
            h(
                "label",
                { className: "sc-language-settings-checkbox" },
                checkbox,
                label,
            ),
        );
    }

    protected renderFooter(): HTMLElement {
        this.footerButtons = [
            this.button("Apply", () => this.apply(), false),
            this.button("Revert", () => this.revert()),
        ];
        this.updateFooter();
        return h(
            "div",
            { className: "sc-language-settings-footer" },
            ...this.footerButtons,
        );
    }

    protected updateFooter(): void {
        for (const button of this.footerButtons) {
            button.disabled = !this.dirty;
        }
    }
}
