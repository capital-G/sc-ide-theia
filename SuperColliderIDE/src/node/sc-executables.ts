import { access, constants, readdir } from "fs/promises";
import * as path from "path";

/**
 * Locations of sclang, scsynth and the user config dir of SuperCollider,
 * see `common/SC_Filesystem_*.cpp` and the `*Platform.sc` classes.
 */

export type ScPlatform = "darwin" | "linux" | "win32";

export interface ScEnvironment {
    platform: ScPlatform;
    env: NodeJS.ProcessEnv;
    home: string;
}

/** `Platform.userConfigDir`, see `SC_Filesystem::defaultUserConfigDirectory` */
export function userConfigDir({ platform, env, home }: ScEnvironment): string {
    const p = platform === "win32" ? path.win32 : path.posix;
    if (platform === "win32") {
        return p.join(
            env.LOCALAPPDATA ?? p.join(home, "AppData", "Local"),
            "SuperCollider",
        );
    }
    if (env.XDG_CONFIG_HOME) {
        return p.join(env.XDG_CONFIG_HOME, "SuperCollider");
    }
    if (platform === "darwin") {
        // falls back to the user app support dir, which also honors XDG_DATA_HOME
        return env.XDG_DATA_HOME
            ? p.join(env.XDG_DATA_HOME, "SuperCollider")
            : p.join(home, "Library", "Application Support", "SuperCollider");
    }
    return p.join(home, ".config", "SuperCollider");
}

async function exists(file: string): Promise<boolean> {
    try {
        await access(file, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/** entries of `dir` starting with `prefix`, newest version names first */
async function matching(dir: string, prefix: string): Promise<string[]> {
    try {
        return (await readdir(dir))
            .filter((name) => name.startsWith(prefix))
            .sort()
            .reverse();
    } catch {
        return [];
    }
}

/** where SuperCollider usually gets installed, the first existing one wins */
export async function sclangCandidates({
    platform,
    env,
    home,
}: ScEnvironment): Promise<string[]> {
    switch (platform) {
        case "darwin": {
            const apps: string[] = [];
            for (const dir of [
                "/Applications",
                path.join(home, "Applications"),
            ]) {
                // SuperCollider.app before versioned ones like SuperCollider-3.14.1.app
                const names = await matching(dir, "SuperCollider");
                names.sort((a, b) =>
                    a === "SuperCollider.app"
                        ? -1
                        : b === "SuperCollider.app"
                          ? 1
                          : 0,
                );
                apps.push(
                    ...names
                        .filter((name) => name.endsWith(".app"))
                        .map((name) =>
                            path.join(dir, name, "Contents", "MacOS", "sclang"),
                        ),
                );
            }
            return apps;
        }
        case "linux":
            return [
                ...(env.PATH ?? "")
                    .split(":")
                    .filter(Boolean)
                    .map((dir) => path.join(dir, "sclang")),
                "/usr/bin/sclang",
                "/usr/local/bin/sclang",
            ];
        case "win32": {
            const result: string[] = [];
            for (const programs of [
                env.ProgramFiles,
                env["ProgramFiles(x86)"],
            ]) {
                if (programs) {
                    for (const name of await matching(
                        programs,
                        "SuperCollider",
                    )) {
                        result.push(
                            path.win32.join(programs, name, "sclang.exe"),
                        );
                    }
                }
            }
            return result;
        }
    }
}

/** sclang of an installation: the app bundle on macOS, the folder w/ sclang otherwise */
export function sclangOfInstallation(
    installation: string,
    platform: ScPlatform,
): string {
    if (platform === "win32") {
        return path.win32.join(installation, "sclang.exe");
    }
    if (platform === "darwin" && /\.app\/?$/.test(installation)) {
        return path.posix.join(installation, "Contents", "MacOS", "sclang");
    }
    return path.posix.join(installation, "sclang");
}

/** the installation a sclang belongs to, the inverse of {@link sclangOfInstallation} */
export function installationOf(sclang: string, platform: ScPlatform): string {
    if (platform === "darwin") {
        const app = sclang.indexOf(".app/");
        if (app >= 0) {
            return sclang.slice(0, app + ".app".length);
        }
    }
    return (platform === "win32" ? path.win32 : path.posix).dirname(sclang);
}

/**
 * The explicit sclang, the one of the installation, `SC_LANG_PATH` or the
 * first installed candidate.
 */
export async function resolveSclang(
    environment: ScEnvironment,
    options: { installation?: string; sclangPath?: string } = {},
): Promise<string | undefined> {
    if (options.sclangPath) {
        return options.sclangPath;
    }
    if (options.installation) {
        return sclangOfInstallation(options.installation, environment.platform);
    }
    if (environment.env.SC_LANG_PATH) {
        return environment.env.SC_LANG_PATH;
    }
    for (const candidate of await sclangCandidates(environment)) {
        if (await exists(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/** the scsynth `Server.program` points to by default, relative to sclang */
export function defaultScsynth(sclang: string, platform: ScPlatform): string {
    if (platform === "darwin") {
        // OSXPlatform: Platform.resourceDir +/+ "../Resources/scsynth"
        return path.posix.join(
            path.posix.dirname(sclang),
            "..",
            "Resources",
            "scsynth",
        );
    }
    if (platform === "win32") {
        return path.win32.join(path.win32.dirname(sclang), "scsynth.exe");
    }
    return path.posix.join(path.posix.dirname(sclang), "scsynth");
}

/** a string literal of sclang */
export function sclangString(value: string): string {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Code which makes the server and Score use another scsynth, the same form as
 * the `startup` methods of the `*Platform` classes.
 */
export function scsynthProgramCode(
    scsynth: string,
    platform: ScPlatform,
): string {
    const program =
        platform === "win32"
            ? `${sclangString(scsynth)}.quote`
            : `"exec " ++ ${sclangString(scsynth)}.shellQuote`;
    return `Server.program = ${program}; Score.program = Server.program;`;
}

export function currentEnvironment(): ScEnvironment {
    return {
        platform: (["darwin", "win32"].includes(process.platform)
            ? process.platform
            : "linux") as ScPlatform,
        env: process.env,
        home: process.env.HOME ?? process.env.USERPROFILE ?? "",
    };
}
