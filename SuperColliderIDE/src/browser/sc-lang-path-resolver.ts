import { URI } from "@theia/core";
import { injectable } from "@theia/core/shared/inversify";

/**
 * Maps a path in sclang's own filesystem (e.g. `Platform.classLibraryDir`,
 * `Method.filenameSymbol`) onto a Theia URI.
 * This is the only platform specific part - desktop sclang shares the OS
 * filesystem, wasm sclang lives in an emscripten MEMFS.
 */
export const ScLangPathResolver = Symbol("ScLangPathResolver");
export interface ScLangPathResolver {
    resolve(path: string): URI;
}

/** desktop: sclang's filesystem is the `file:` filesystem */
@injectable()
export class ScFileLangPathResolver implements ScLangPathResolver {
    resolve(path: string): URI {
        return URI.fromFilePath(path);
    }
}
