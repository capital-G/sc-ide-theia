import { CommandService, isOSX, URI } from "@theia/core";
import {
    BaseWidget,
    Message,
    OpenerService,
    open,
} from "@theia/core/lib/browser";
import {
    inject,
    injectable,
    postConstruct,
} from "@theia/core/shared/inversify";
import { ScService } from "../common/protocol";
import {
    SC_HELP_HOME,
    SC_HELP_ROUTE,
    ScHelpTarget,
    helpTargetUrl,
} from "../common/sc-help";
import { ScLangPathResolver } from "./sc-lang-path-resolver";

export const SC_HELP_WIDGET_ID = "sc-help";

/**
 * Makes the help route reachable - immediate for the node backend,
 * the wasm build has to wait for its service worker.
 */
export const ScHelpTransport = Symbol("ScHelpTransport");
export interface ScHelpTransport {
    ready(): Promise<void>;
}

/** the node backend serves the help route via express */
@injectable()
export class ScBackendHelpTransport implements ScHelpTransport {
    async ready(): Promise<void> {}
}

/** commands the help page can trigger via keyboard - injected to avoid a circular import */
export const ScHelpKeyCommands = Symbol("ScHelpKeyCommands");
export interface ScHelpKeyCommands {
    stop: string;
}

/**
 * Same origin iframe onto {@link SC_HELP_ROUTE}, so links within the help
 * get rendered on demand by sclang.
 */
@injectable()
export class ScHelpWidget extends BaseWidget {
    @inject(ScService) protected readonly scService!: ScService;
    @inject(ScHelpTransport) protected readonly transport!: ScHelpTransport;
    @inject(OpenerService) protected readonly openerService!: OpenerService;
    @inject(CommandService) protected readonly commands!: CommandService;
    @inject(ScHelpKeyCommands)
    protected readonly keyCommands!: ScHelpKeyCommands;
    @inject(ScLangPathResolver)
    protected readonly pathResolver!: ScLangPathResolver;

    protected frame!: HTMLIFrameElement;
    /** focus the search field of `Search.html` once it got loaded */
    protected focusSearchOnLoad = false;
    /** url of the loaded page, the iframe resets when it gets moved in the DOM */
    protected current: string | undefined;

    @postConstruct()
    protected init(): void {
        this.id = SC_HELP_WIDGET_ID;
        this.title.label = "Help";
        this.title.caption = "SuperCollider Help";
        this.title.iconClass = "codicon codicon-book";
        this.title.closable = true;
        this.addClass("sc-help");
        this.node.tabIndex = 0;

        this.frame = document.createElement("iframe");
        this.frame.className = "sc-help-frame";
        this.frame.title = "SuperCollider Help";
        this.frame.addEventListener("load", () => this.onFrameLoad());
        this.node.appendChild(this.frame);
    }

    /** loads a page, url is below {@link SC_HELP_ROUTE} */
    async goTo(url: string): Promise<void> {
        await this.transport.ready();
        this.current = url;
        // assigning the same url w/ a different fragment only scrolls
        this.frame.src = url;
    }

    async showTarget(target: ScHelpTarget): Promise<void> {
        if (target.kind === "remote") {
            window.open(target.url, "_blank", "noopener");
            return;
        }
        await this.goTo(helpTargetUrl(target));
    }

    goHome(): Promise<void> {
        return this.goTo(SC_HELP_ROUTE + SC_HELP_HOME);
    }

    back(): void {
        this.frame.contentWindow?.history.back();
    }

    forward(): void {
        this.frame.contentWindow?.history.forward();
    }

    reload(): void {
        this.frame.contentWindow?.location.reload();
    }

    /** opens the search page of the help */
    async focusSearch(): Promise<void> {
        this.focusSearchOnLoad = true;
        await this.goTo(`${SC_HELP_ROUTE}Search.html`);
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        // moving the iframe in the DOM, e.g. by dragging the tab, reloads it
        if (this.current) {
            this.goTo(this.current);
        } else {
            this.goHome();
        }
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.frame.focus();
    }

    protected onFrameLoad(): void {
        const win = this.frame.contentWindow;
        let doc: Document | undefined;
        try {
            doc = win?.document;
            const loc = win?.location;
            if (loc?.pathname.startsWith(SC_HELP_ROUTE)) {
                this.current = loc.pathname + loc.search + loc.hash;
            }
        } catch {
            // cross origin page, e.g. a remote link which was not intercepted
            return;
        }
        if (!win || !doc) {
            return;
        }
        this.title.label = doc.title ? doc.title : "Help";
        doc.addEventListener("click", (e) => this.onFrameClick(e), true);
        doc.addEventListener("keydown", (e) => this.onFrameKey(win, e), true);
        if (this.focusSearchOnLoad) {
            this.focusSearchOnLoad = false;
            // `instanceof` fails across frames, query the element by its type instead
            const input =
                doc.querySelector<HTMLInputElement>("input#search_input");
            if (input) {
                this.frame.focus();
                input.focus();
                input.select();
            }
        }
    }

    /** links which can not be displayed within the help browser */
    protected onFrameClick(e: MouseEvent): void {
        const anchor = (e.target as Element | null)?.closest?.("a[href]");
        const href = (anchor as HTMLAnchorElement | null)?.href;
        if (!href) {
            return;
        }
        const url = new URL(href);
        if (url.protocol === "file:") {
            // e.g. the source of a class, open it in the editor
            e.preventDefault();
            const path = decodeURIComponent(url.pathname);
            open(this.openerService, this.resolveFile(path));
        } else if (url.origin !== window.location.origin) {
            // most sites forbid to be framed anyways
            e.preventDefault();
            window.open(href, "_blank", "noopener");
        }
    }

    protected resolveFile(path: string): URI {
        return this.pathResolver.resolve(path);
    }

    /** same shortcuts as in the code editor, see the Qt IDE's HelpBrowser */
    protected onFrameKey(win: Window, e: KeyboardEvent): void {
        const mod = isOSX ? e.metaKey : e.ctrlKey;
        let handled = true;
        if (e.key === "Enter" && (mod || e.shiftKey)) {
            this.evaluate(win, mod ? "selectRegion()" : "selectLine()");
        } else if (mod && e.key === ".") {
            this.commands.executeCommand(this.keyCommands.stop);
        } else if (mod && e.key.toLowerCase() === "d") {
            const word = win.getSelection()?.toString().trim();
            if (word) {
                this.scService
                    .queryHelpFor(word)
                    .then((target) => target && this.showTarget(target));
            }
        } else {
            handled = false;
        }
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /** a selection has precedence, otherwise ask the page's editor.js */
    protected evaluate(win: Window, selector: string): void {
        let code = win.getSelection()?.toString() ?? "";
        if (!code.trim()) {
            try {
                // `selectRegion` is a top level const of editor.js, so not a property of window
                code = String(
                    (win as unknown as { eval(code: string): unknown }).eval(
                        `typeof ${selector.slice(0, -2)} === "function" ? ${selector} : ""`,
                    ) ?? "",
                );
            } catch {
                code = "";
            }
        }
        if (code.trim()) {
            this.scService.evaluate(code);
        }
    }
}
