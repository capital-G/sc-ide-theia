import {
    inject,
    injectable,
    postConstruct,
} from "@theia/core/shared/inversify";
import { resolveHelpRequest } from "../common/sc-help";
import { ScHelpTransport } from "../browser/sc-help-widget";
import { EmscriptenFS } from "./sclang-wasm-runtime";
import { ScServiceBrowser } from "./sc-service-browser";

/** published by the browser-only-app next to index.html */
export const SC_HELP_SW_URL = "/sc-help-sw.js";

interface ScHelpSwRequest {
    type: "sc-help-request";
    path: string;
}

/** what `sc-help-sw.js` turns into a Response */
type ScHelpSwReply =
    | { location: string }
    | { status: number; contentType: string; body: ArrayBuffer };

/**
 * wasm: there is no backend which serves the help, so a service worker
 * intercepts the requests of the help frame and forwards them to this window,
 * which prepares the page in sclang and reads it from its MEMFS.
 */
@injectable()
export class ScServiceWorkerHelpTransport implements ScHelpTransport {
    @inject(ScServiceBrowser) protected readonly sc!: ScServiceBrowser;

    protected registration: Promise<void> | undefined;
    protected helpDir: string | undefined;

    @postConstruct()
    protected init(): void {
        if (!("serviceWorker" in navigator)) {
            console.warn("No service worker support - help is not available");
            return;
        }
        navigator.serviceWorker.addEventListener("message", (e) =>
            this.onMessage(e),
        );
        // the listener does not start the message queue on its own
        navigator.serviceWorker.startMessages();
    }

    ready(): Promise<void> {
        if (!this.registration) {
            this.registration = this.register().catch((e) => {
                console.error("Could not register the help service worker", e);
                this.registration = undefined;
            });
        }
        return this.registration;
    }

    /**
     * `navigator.serviceWorker.ready` refers to the scope of this window,
     * which is not covered by the help scope, so wait on our own registration.
     */
    protected async register(): Promise<void> {
        const reg = await navigator.serviceWorker.register(SC_HELP_SW_URL, {
            scope: "/sc-help/",
        });
        if (reg.active) {
            return;
        }
        const worker = reg.installing ?? reg.waiting;
        await new Promise<void>((resolve) => {
            worker?.addEventListener("statechange", () => {
                if (worker.state === "activated") {
                    resolve();
                }
            });
        });
    }

    protected async onMessage(e: MessageEvent): Promise<void> {
        const data = e.data as ScHelpSwRequest | undefined;
        const port = e.ports[0];
        if (data?.type !== "sc-help-request" || !port) {
            return;
        }
        let reply: ScHelpSwReply;
        try {
            reply = await this.handle(data.path);
        } catch (err) {
            console.error("sc help request failed", err);
            reply = this.text(500, String(err));
        }
        port.postMessage(reply, "body" in reply ? [reply.body] : []);
    }

    protected async handle(urlPath: string): Promise<ScHelpSwReply> {
        const helpDir = await this.resolveHelpDir();
        const fs = this.sc.sclangFs;
        const response = await resolveHelpRequest(
            {
                prepareHelp: (path) => this.sc.prepareHelp(path),
                exists: async (path) =>
                    !!fs && !!helpDir && isFile(fs, `${helpDir}/${path}`),
            },
            urlPath,
        );
        switch (response.kind) {
            case "redirect":
                return { location: response.location };
            case "error":
                return this.text(
                    response.status,
                    response.html,
                    "text/html; charset=utf-8",
                );
            case "file": {
                const path = `${helpDir}/${response.path}`;
                if (!fs || !helpDir || !isFile(fs, path)) {
                    return this.text(404, "Not found");
                }
                // copy, as the file contents may be a view onto the wasm heap
                const bytes = fs.readFile(path, { encoding: "binary" }).slice();
                return {
                    status: 200,
                    contentType: response.contentType,
                    body: bytes.buffer,
                };
            }
        }
    }

    protected text(
        status: number,
        text: string,
        contentType = "text/plain; charset=utf-8",
    ): ScHelpSwReply {
        return {
            status,
            contentType,
            body: new TextEncoder().encode(text).buffer as ArrayBuffer,
        };
    }

    protected async resolveHelpDir(): Promise<string | undefined> {
        if (!this.helpDir) {
            this.helpDir = await this.sc.queryHelpTargetDir();
        }
        return this.helpDir;
    }
}

function isFile(fs: EmscriptenFS, path: string): boolean {
    try {
        return fs.isFile(fs.stat(path).mode);
    } catch {
        return false;
    }
}
