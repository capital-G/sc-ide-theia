import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import { FileService } from "@theia/filesystem/lib/browser/file-service";
import * as monaco from "@theia/monaco-editor-core";
import {
    SC_CLASS_REGEX,
    SC_ENV_REGEX,
    ScDefinitionKind,
    ScLocation,
    ScMethodSide,
    ScService,
} from "../common/protocol";
import { guessReceiver } from "./sc-call-context";
import { ScClientImpl } from "./sc-client-impl";
import { sourcePosition, symbolTarget } from "./sc-definition-target";
import { SC_LANGUAGE_ID } from "./sc-language-contribution";
import { ScLangPathResolver } from "./sc-lang-path-resolver";

type ScLookup = "definition" | "implementation" | "references";

/**
 * Go to definition (F12, cmd+click), go to implementations (cmd+F12) and
 * references (shift+F12) for classes and methods - similar to the lookup
 * dialogs of the Qt IDE.
 * Monaco jumps directly on a single result and shows a peek view w/ a
 * preview for multiple results, e.g. for all implementations of `ar`.
 */
@injectable()
export class ScDefinitionProvider implements FrontendApplicationContribution {
    @inject(ScService) protected readonly scService!: ScService;
    @inject(ScClientImpl) protected readonly client!: ScClientImpl;
    @inject(FileService) protected readonly fileService!: FileService;
    @inject(ScLangPathResolver)
    protected readonly pathResolver!: ScLangPathResolver;

    onStart(): void {
        monaco.languages.registerDefinitionProvider(SC_LANGUAGE_ID, {
            provideDefinition: (model, position, token) =>
                this.provide(model, position, token, "definition"),
        });
        monaco.languages.registerImplementationProvider(SC_LANGUAGE_ID, {
            provideImplementation: (model, position, token) =>
                this.provide(model, position, token, "implementation"),
        });
        monaco.languages.registerReferenceProvider(SC_LANGUAGE_ID, {
            provideReferences: (model, position, _context, token) =>
                this.provide(model, position, token, "references"),
        });
    }

    protected async provide(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        token: monaco.CancellationToken,
        lookup: ScLookup,
    ): Promise<monaco.languages.Location[] | undefined> {
        const state = this.client.state;
        if (state.kind !== "running" || !state.compiled) {
            return undefined;
        }
        const word = model.getWordAtPosition(position);
        if (!word) {
            return undefined;
        }
        // up to the end of the word, as the cursor can be within the word
        const linePrefix = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
        });
        const target = symbolTarget(linePrefix, word.word);
        if (!target) {
            return undefined;
        }

        let locations: ScLocation[];
        if (lookup === "references") {
            locations = await this.scService.queryDefinition(
                "references",
                target.name,
            );
        } else if (target.kind === "class") {
            locations = await this.scService.queryDefinition(
                lookup === "definition" ? "class" : "classImpl",
                target.name,
            );
        } else {
            const kind: ScDefinitionKind =
                lookup === "definition" ? "method" : "methodImpl";
            const { receiver, side } = await this.resolveReceiver(
                target.receiver,
            );
            locations = await this.scService.queryDefinition(
                kind,
                target.name,
                receiver,
                side,
            );
        }
        if (token.isCancellationRequested) {
            return undefined;
        }
        return this.toMonacoLocations(locations);
    }

    /** same strategy as the signature help: literals, classes, then ~env vars */
    protected async resolveReceiver(
        receiver: string | undefined,
    ): Promise<{ receiver?: string; side?: ScMethodSide }> {
        if (!receiver) {
            return {};
        }
        let cls = guessReceiver(receiver);
        if (!cls && SC_ENV_REGEX.test(receiver)) {
            cls = await this.scService.queryEnvClass(receiver.slice(1));
        }
        if (!cls) {
            return {};
        }
        return {
            receiver: cls,
            side: SC_CLASS_REGEX.test(receiver) ? "class" : "instance",
        };
    }

    protected async toMonacoLocations(
        locations: ScLocation[],
    ): Promise<monaco.languages.Location[]> {
        // many locations share a file, e.g. all methods of a class
        const files = new Map<string, Promise<Uint8Array | undefined>>();
        const read = (path: string) => {
            let file = files.get(path);
            if (!file) {
                file = this.fileService
                    .readFile(this.pathResolver.resolve(path))
                    .then((content) => content.value.buffer)
                    .catch((e) => {
                        console.warn(`Could not read ${path}`, e);
                        return undefined;
                    });
                files.set(path, file);
            }
            return file;
        };

        const resolved = await Promise.all(
            locations.map(async (loc) => {
                const bytes = await read(loc.path);
                const pos = bytes && sourcePosition(bytes, loc.charPos);
                if (!pos) {
                    return undefined;
                }
                const location: monaco.languages.Location = {
                    uri: monaco.Uri.parse(
                        this.pathResolver.resolve(loc.path).toString(),
                    ),
                    range: new monaco.Range(
                        pos.lineNumber,
                        pos.column,
                        pos.lineNumber,
                        pos.column + pos.length,
                    ),
                };
                return location;
            }),
        );
        return resolved.filter(
            (l): l is monaco.languages.Location => l !== undefined,
        );
    }
}
