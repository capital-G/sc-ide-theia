/**
 * Help browser plumbing shared by the node backend (express route) and the
 * wasm build (service worker), modeled after the Qt IDE: every requested page
 * goes through `SCDoc.prepareHelpForURL` first, which renders the schelp
 * source on demand if the html is missing or outdated.
 */

/** same origin path the help files are served at - relative links stay within it */
export const SC_HELP_ROUTE = "/sc-help/";
export const SC_HELP_HOME = "Help.html";
/** rendering the first page indexes all help files, which can take a while */
export const SC_HELP_TIMEOUT_MS = 60_000;

/** a help location reported by sclang */
export type ScHelpTarget =
    | {
          kind: "local";
          /** relative to `SCDoc.helpTargetDir` */
          path: string;
          fragment?: string;
          query?: string;
      }
    | { kind: "remote"; url: string };

export function decodeHelpTarget(
    rows: string[] | undefined,
): ScHelpTarget | undefined {
    const [kind, a, fragment, query] = rows ?? [];
    if (kind === "local" && a) {
        return {
            kind,
            path: a,
            fragment: fragment || undefined,
            query: query || undefined,
        };
    }
    if (kind === "remote" && a) {
        return { kind, url: a };
    }
    return undefined;
}

/** the url to load in the help browser */
export function helpTargetUrl(target: ScHelpTarget): string {
    if (target.kind === "remote") {
        return target.url;
    }
    const path = target.path.split("/").map(encodeURIComponent).join("/");
    return (
        SC_HELP_ROUTE +
        path +
        (target.query ? `?${target.query}` : "") +
        (target.fragment ? `#${target.fragment}` : "")
    );
}

/**
 * Turns the path of a request url below {@link SC_HELP_ROUTE} into a path
 * relative to the help target dir - undefined if it tries to escape it.
 */
export function helpRequestPath(urlPath: string): string | undefined {
    if (!urlPath.startsWith(SC_HELP_ROUTE)) {
        return undefined;
    }
    let path: string;
    try {
        path = decodeURIComponent(urlPath.slice(SC_HELP_ROUTE.length));
    } catch {
        return undefined;
    }
    if (path === "") {
        return SC_HELP_HOME;
    }
    // the path ends up in a sclang string and the filesystem
    if (/[\x00-\x1f\x7f\\]/.test(path) || path.startsWith("/")) {
        return undefined;
    }
    if (
        path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")
    ) {
        return undefined;
    }
    return path;
}

export type ScHelpResponse =
    | { kind: "file"; path: string; contentType: string }
    | { kind: "redirect"; location: string }
    | { kind: "error"; status: number; html: string };

export interface ScHelpBackend {
    prepareHelp(path: string): Promise<ScHelpTarget | undefined>;
    /** if the path exists below the help target dir */
    exists(path: string): Promise<boolean>;
}

/**
 * Decides how to answer a request for a help file.
 * Only html pages need to be prepared - static files (css, js, images) are
 * copied into the help target dir by SCDoc when indexing, which happens on
 * the first page anyways.
 */
export async function resolveHelpRequest(
    backend: ScHelpBackend,
    urlPath: string,
): Promise<ScHelpResponse> {
    const path = helpRequestPath(urlPath);
    if (!path) {
        return helpError(400, "Invalid help path.");
    }
    if (path.endsWith(".html")) {
        const target = await backend.prepareHelp(path);
        if (!target) {
            return helpError(
                503,
                "The interpreter is not running (yet) - this page reloads automatically.",
                true,
            );
        }
        if (
            target.kind === "remote" ||
            target.path !== path ||
            target.fragment ||
            target.query
        ) {
            return { kind: "redirect", location: helpTargetUrl(target) };
        }
    } else if (!(await backend.exists(path))) {
        return helpError(404, `Not found: ${escapeHtml(path)}`);
    }
    return { kind: "file", path, contentType: helpContentType(path) };
}

const CONTENT_TYPES: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    txt: "text/plain; charset=utf-8",
    scd: "text/plain; charset=utf-8",
    sc: "text/plain; charset=utf-8",
    schelp: "text/plain; charset=utf-8",
    wav: "audio/wav",
    aiff: "audio/aiff",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
};

export function helpContentType(path: string): string {
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function helpError(
    status: number,
    message: string,
    retry = false,
): ScHelpResponse {
    return {
        kind: "error",
        status,
        html:
            `<!doctype html><html><head><meta charset="utf-8">` +
            (retry ? `<meta http-equiv="refresh" content="2">` : "") +
            `<style>body{font-family:sans-serif;padding:1em;color:#888}</style>` +
            `</head><body><p>${message}</p></body></html>`,
    };
}

function escapeHtml(s: string): string {
    return s.replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c]!,
    );
}
