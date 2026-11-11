import { injectable } from "@theia/core/shared/inversify";
import { mkdir, readFile, readdir, unlink, writeFile } from "fs/promises";
import * as path from "path";
import { Document, isMap, parseDocument } from "yaml";
import {
    DEFAULT_LANGUAGE_CONFIG,
    SC_CONFIG_NAME_REGEX,
    ScLanguageConfig,
    ScLanguageConfigInfo,
    ScLanguageConfigService,
    ScLaunchOptions,
} from "../common/sc-language-config";
import {
    ScEnvironment,
    currentEnvironment,
    defaultScsynth,
    installationOf,
    resolveSclang,
    userConfigDir,
} from "./sc-executables";

const DEFAULT_CONFIG_NAME = "sclang_conf.yaml";
const CONFIG_FILE_REGEX = /^sclang_conf.*\.yaml$/;

function strings(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter(
              (v): v is string => typeof v === "string" && v.length > 0,
          )
        : [];
}

/** reads the keys sclang knows, ignores everything else */
export function parseLanguageConfig(source: string): ScLanguageConfig {
    const doc = parseDocument(source);
    const json = doc.toJS() as Record<string, unknown> | null;
    if (!json || typeof json !== "object") {
        return { ...DEFAULT_LANGUAGE_CONFIG };
    }
    const bool = (key: keyof ScLanguageConfig) =>
        typeof json[key] === "boolean"
            ? (json[key] as boolean)
            : (DEFAULT_LANGUAGE_CONFIG[key] as boolean);
    return {
        includePaths: strings(json.includePaths),
        excludePaths: strings(json.excludePaths),
        postInlineWarnings: bool("postInlineWarnings"),
        excludeDefaultPaths: bool("excludeDefaultPaths"),
    };
}

/** updates the keys of `config` within `source`, keeping comments and other keys */
export function updateLanguageConfig(
    source: string,
    config: ScLanguageConfig,
): string {
    let doc: Document = parseDocument(source);
    if (!isMap(doc.contents)) {
        // an empty file, or not a mapping sclang could read anyways
        doc = new Document({});
    }
    for (const key of ["includePaths", "excludePaths"] as const) {
        doc.set(key, doc.createNode(config[key]));
    }
    doc.set("postInlineWarnings", config.postInlineWarnings);
    doc.set("excludeDefaultPaths", config.excludeDefaultPaths);
    return doc.toString({ indent: 4, indentSeq: true });
}

/**
 * Manages the `sclang_conf*.yaml` files within `Platform.userConfigDir`,
 * like the interpreter page of the Qt IDE's settings.
 */
@injectable()
export class ScLanguageConfigServiceImpl implements ScLanguageConfigService {
    protected environment: ScEnvironment = currentEnvironment();

    protected get configDir(): string {
        return userConfigDir(this.environment);
    }

    async getInfo(
        options: ScLaunchOptions = {},
    ): Promise<ScLanguageConfigInfo> {
        const configDir = this.configDir;
        let configFiles: string[] = [];
        try {
            configFiles = (await readdir(configDir))
                .filter((name) => CONFIG_FILE_REGEX.test(name))
                .sort()
                .map((name) => path.join(configDir, name));
        } catch {
            // no config dir yet
        }
        const { platform } = this.environment;
        const detected = await resolveSclang(this.environment);
        const sclang = await resolveSclang(this.environment, options);
        return {
            platform,
            home: this.environment.home,
            configDir,
            defaultConfigFile: path.join(configDir, DEFAULT_CONFIG_NAME),
            configFiles,
            detectedInstallation:
                detected && installationOf(detected, platform),
            sclang,
            scsynth:
                options.scsynthPath ||
                (sclang && defaultScsynth(sclang, platform)),
        };
    }

    async read(file: string): Promise<ScLanguageConfig> {
        try {
            return parseLanguageConfig(await readFile(file, "utf8"));
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "ENOENT") {
                return { ...DEFAULT_LANGUAGE_CONFIG };
            }
            throw e;
        }
    }

    async write(file: string, config: ScLanguageConfig): Promise<void> {
        let source = "";
        try {
            source = await readFile(file, "utf8");
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                throw e;
            }
        }
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, updateLanguageConfig(source, config), "utf8");
    }

    async create(name: string, config: ScLanguageConfig): Promise<string> {
        if (!SC_CONFIG_NAME_REGEX.test(name)) {
            throw new Error(
                `Invalid name "${name}", only letters, digits, "_" and "-" are allowed`,
            );
        }
        const file = path.join(this.configDir, `sclang_conf_${name}.yaml`);
        await mkdir(this.configDir, { recursive: true });
        try {
            // fails if the file exists
            await writeFile(file, updateLanguageConfig("", config), {
                encoding: "utf8",
                flag: "wx",
            });
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "EEXIST") {
                throw new Error(`Configuration file already exists: ${file}`);
            }
            throw e;
        }
        return file;
    }

    async delete(file: string): Promise<void> {
        const resolved = path.resolve(file);
        if (
            path.dirname(resolved) !== path.resolve(this.configDir) ||
            !CONFIG_FILE_REGEX.test(path.basename(resolved))
        ) {
            throw new Error(`Not a language configuration file: ${file}`);
        }
        await unlink(resolved);
    }
}
