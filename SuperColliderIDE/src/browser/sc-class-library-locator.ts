import { Emitter, Event, URI } from "@theia/core";
import {
    inject,
    injectable,
    postConstruct,
} from "@theia/core/shared/inversify";
import { ScService } from "../common/protocol";
import { ScClientImpl } from "./sc-client-impl";
import { ScLangPathResolver } from "./sc-lang-path-resolver";

/**
 * Knows where the class library lives - this is platform specific as
 * desktop has to ask sclang, while wasm has it at a fixed MEMFS path.
 */
export const ScClassLibraryLocator = Symbol("ScClassLibraryLocator");
export interface ScClassLibraryLocator {
    /** undefined as long as the class library is not reachable */
    readonly root: URI | undefined;
    readonly onDidChangeRoot: Event<URI | undefined>;
}

/** desktop: the install location varies, so sclang has to tell us once compiled */
@injectable()
export class ScLangClassLibraryLocator implements ScClassLibraryLocator {
    @inject(ScClientImpl) protected readonly scClient!: ScClientImpl;
    @inject(ScService) protected readonly scService!: ScService;
    @inject(ScLangPathResolver)
    protected readonly pathResolver!: ScLangPathResolver;

    protected readonly rootEmitter = new Emitter<URI | undefined>();
    readonly onDidChangeRoot = this.rootEmitter.event;
    root: URI | undefined;

    @postConstruct()
    protected init(): void {
        this.scClient.onStateChangedEvent(() => this.update());
        this.update();
    }

    protected async update(): Promise<void> {
        const state = this.scClient.state;
        // the path does not change between reboots, so keep the last known one
        if (this.root || state.kind !== "running" || !state.compiled) {
            return;
        }
        const dir = await this.scService.queryClassLibraryDir();
        if (!dir) {
            console.warn("sclang did not report a class library directory");
            return;
        }
        this.root = this.pathResolver.resolve(dir);
        this.rootEmitter.fire(this.root);
    }
}
