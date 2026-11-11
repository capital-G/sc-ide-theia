import { Disposable, Emitter, Event, URI } from "@theia/core";
import {
    inject,
    injectable,
    postConstruct,
} from "@theia/core/shared/inversify";
import {
    FileChange,
    FileChangeType,
    FileDeleteOptions,
    FileOverwriteOptions,
    FileSystemProviderCapabilities,
    FileSystemProviderError,
    FileSystemProviderErrorCode,
    FileSystemProviderWithFileReadWriteCapability,
    FileType,
    FileWriteOptions,
    Stat,
    createFileSystemProviderError,
} from "@theia/filesystem/lib/common/files";
import {
    FileService,
    FileServiceContribution,
} from "@theia/filesystem/lib/browser/file-service";
import { EmscriptenFS } from "./sclang-wasm-runtime";
import { ScServiceBrowser } from "./sc-service-browser";
import { ScLangPathResolver } from "../browser/sc-lang-path-resolver";
import { ScClassLibraryLocator } from "../browser/sc-class-library-locator";

export const SCLANG_FS_SCHEME = "sclang";
/** fixed by the `--preload-file ...@/sc/SCClassLibrary` of the sclang wasm build */
export const SCLANG_CLASS_LIBRARY_PATH = "/sc/SCClassLibrary";
/** loading the wasm module includes downloading the class library and the docs */
const FS_READY_TIMEOUT = 120_000;

/**
 * errno values of emscripten, which differ from posix
 * see `system/lib/libc/musl/arch/emscripten/bits/errno.h`
 */
const ERRNO = {
    EEXIST: 20,
    EISDIR: 31,
    ENOENT: 44,
    ENOTDIR: 54,
} as const;

/**
 * View onto sclang's emscripten MEMFS, `sclang:/sc/...` -> `/sc/...`.
 * Writes are visible to sclang (e.g. after a recompile), but they are not
 * persisted and get lost on reload.
 */
export class SclangFsProvider implements FileSystemProviderWithFileReadWriteCapability {
    readonly capabilities =
        FileSystemProviderCapabilities.FileReadWrite |
        FileSystemProviderCapabilities.PathCaseSensitive;

    readonly onDidChangeCapabilities = Event.None;

    protected readonly changeEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.changeEmitter.event;
    readonly onFileWatchError: Event<void> = Event.None;

    // fs is runtime dependent and not owned
    constructor(
        protected readonly fs: () => EmscriptenFS | undefined,
        protected readonly onFsReady: Event<void>,
    ) {}

    // can not watch memfs
    watch(): Disposable {
        return Disposable.NULL;
    }

    async stat(resource: URI): Promise<Stat> {
        const fs = await this.ready();
        const s = this.call(() => fs.stat(resource.path.toString()));
        return {
            type: fs.isDir(s.mode) ? FileType.Directory : FileType.File,
            ctime: s.mtime.getTime(),
            mtime: s.mtime.getTime(),
            size: s.size,
        };
    }

    async readdir(resource: URI): Promise<[string, FileType][]> {
        const fs = await this.ready();
        return this.call(() =>
            fs
                .readdir(resource.path.toString())
                .filter((n) => n !== "." && n !== "..")
                .map((n): [string, FileType] => {
                    const child = resource.path.join(n).toString();
                    return [
                        n,
                        fs.isDir(fs.stat(child).mode)
                            ? FileType.Directory
                            : FileType.File,
                    ];
                }),
        );
    }

    async readFile(resource: URI): Promise<Uint8Array> {
        const fs = await this.ready();
        return this.call(() =>
            fs.readFile(resource.path.toString(), { encoding: "binary" }),
        );
    }

    async writeFile(
        resource: URI,
        content: Uint8Array,
        opts: FileWriteOptions,
    ): Promise<void> {
        const fs = await this.ready();
        const path = resource.path.toString();
        const exists = this.exists(fs, path);
        if (exists && fs.isDir(fs.stat(path).mode)) {
            throw providerError(
                "is a directory",
                FileSystemProviderErrorCode.FileIsADirectory,
            );
        }
        if (!exists && !opts.create) {
            throw providerError(
                "file not found",
                FileSystemProviderErrorCode.FileNotFound,
            );
        }
        if (exists && !opts.overwrite) {
            throw providerError(
                "file exists",
                FileSystemProviderErrorCode.FileExists,
            );
        }
        this.call(() => fs.writeFile(path, content));
        this.fireChange(
            exists ? FileChangeType.UPDATED : FileChangeType.ADDED,
            resource,
        );
    }

    async mkdir(resource: URI): Promise<void> {
        const fs = await this.ready();
        this.call(() => fs.mkdir(resource.path.toString()));
        this.fireChange(FileChangeType.ADDED, resource);
    }

    async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        const fs = await this.ready();
        this.call(() =>
            this.deletePath(fs, resource.path.toString(), opts.recursive),
        );
        this.fireChange(FileChangeType.DELETED, resource);
    }

    async rename(
        from: URI,
        to: URI,
        opts: FileOverwriteOptions,
    ): Promise<void> {
        const fs = await this.ready();
        const target = to.path.toString();
        if (this.exists(fs, target)) {
            if (!opts.overwrite) {
                throw providerError(
                    "file exists",
                    FileSystemProviderErrorCode.FileExists,
                );
            }
            this.call(() => this.deletePath(fs, target, true));
        }
        this.call(() => fs.rename(from.path.toString(), target));
        this.changeEmitter.fire([
            { type: FileChangeType.DELETED, resource: from },
            { type: FileChangeType.ADDED, resource: to },
        ]);
    }

    protected deletePath(
        fs: EmscriptenFS,
        path: string,
        recursive: boolean,
    ): void {
        if (!fs.isDir(fs.stat(path).mode)) {
            fs.unlink(path);
            return;
        }
        if (recursive) {
            for (const name of fs.readdir(path)) {
                if (name !== "." && name !== "..") {
                    this.deletePath(fs, `${path}/${name}`, true);
                }
            }
        }
        fs.rmdir(path);
    }

    protected exists(fs: EmscriptenFS, path: string): boolean {
        try {
            fs.stat(path);
            return true;
        } catch {
            return false;
        }
    }

    protected fireChange(type: FileChangeType, resource: URI): void {
        this.changeEmitter.fire([{ type, resource }]);
    }

    /**
     * Theia restores the editors of the last session (e.g. a class file) before
     * sclang gets started, so wait for the module to be loaded.
     */
    protected ready(): Promise<EmscriptenFS> {
        const fs = this.fs();
        if (fs) {
            return Promise.resolve(fs);
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                listener.dispose();
                reject(
                    createFileSystemProviderError(
                        "sclang not started",
                        FileSystemProviderErrorCode.Unavailable,
                    ),
                );
            }, FS_READY_TIMEOUT);
            const listener = this.onFsReady(() => {
                clearTimeout(timeout);
                listener.dispose();
                resolve(this.fs()!);
            });
        });
    }

    /** translate emscripten's ErrnoError into something theia understands */
    protected call<T>(fn: () => T): T {
        try {
            return fn();
        } catch (e) {
            if (e instanceof FileSystemProviderError) {
                throw e;
            }
            const err = e as { errno?: number };
            const code = ERRNO_CODES[err.errno ?? -1];
            if (code) {
                throw providerError(String(e), code);
            }
            throw createFileSystemProviderError(
                String(e),
                FileSystemProviderErrorCode.Unknown,
            );
        }
    }
}

const ERRNO_CODES: Record<number, FileSystemProviderErrorCode> = {
    [ERRNO.EEXIST]: FileSystemProviderErrorCode.FileExists,
    [ERRNO.EISDIR]: FileSystemProviderErrorCode.FileIsADirectory,
    [ERRNO.ENOENT]: FileSystemProviderErrorCode.FileNotFound,
    [ERRNO.ENOTDIR]: FileSystemProviderErrorCode.FileNotADirectory,
};

function providerError(
    message: string,
    code: FileSystemProviderErrorCode,
): FileSystemProviderError {
    return createFileSystemProviderError(message, code);
}

@injectable()
export class SclangFsContribution implements FileServiceContribution {
    @inject(ScServiceBrowser) protected readonly sc!: ScServiceBrowser;

    registerFileSystemProviders(service: FileService): void {
        service.registerProvider(
            SCLANG_FS_SCHEME,
            new SclangFsProvider(
                () => this.sc.sclangFs,
                this.sc.onSclangFsReady,
            ),
        );
    }
}

/** wasm: sclang's filesystem is exposed through the `sclang:` provider */
@injectable()
export class ScMemfsLangPathResolver implements ScLangPathResolver {
    resolve(path: string): URI {
        return new URI().withScheme(SCLANG_FS_SCHEME).withPath(path);
    }
}

/** wasm: the class library is preloaded at a fixed path, reachable once the module is loaded */
@injectable()
export class ScMemfsClassLibraryLocator implements ScClassLibraryLocator {
    @inject(ScServiceBrowser) protected readonly sc!: ScServiceBrowser;
    @inject(ScLangPathResolver)
    protected readonly pathResolver!: ScLangPathResolver;

    protected readonly rootEmitter = new Emitter<URI | undefined>();
    readonly onDidChangeRoot = this.rootEmitter.event;

    get root(): URI | undefined {
        return this.sc.sclangFs
            ? this.pathResolver.resolve(SCLANG_CLASS_LIBRARY_PATH)
            : undefined;
    }

    @postConstruct()
    protected init(): void {
        this.sc.onSclangFsReady(() => this.rootEmitter.fire(this.root));
    }
}
