import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { injectable } from "@theia/core/shared/inversify";
import * as monaco from "@theia/monaco-editor-core";
import { SC_LANGUAGE_ID } from "./sc-language-contribution";
import { parseScOutline, ScSymbol, ScSymbolKind } from "./sc-outline-parser";

const KINDS: Record<ScSymbolKind, monaco.languages.SymbolKind> = {
    class: monaco.languages.SymbolKind.Class,
    extension: monaco.languages.SymbolKind.Class,
    method: monaco.languages.SymbolKind.Method,
    region: monaco.languages.SymbolKind.Module,
    definition: monaco.languages.SymbolKind.Function,
};

/**
 * Feeds the outline view and the breadcrumbs of sclang documents,
 * see {@link parseScOutline}.
 */
@injectable()
export class ScOutlineProvider implements FrontendApplicationContribution {
    onStart(): void {
        monaco.languages.registerDocumentSymbolProvider(SC_LANGUAGE_ID, {
            displayName: "SuperCollider",
            provideDocumentSymbols: (model) => {
                const classFile = model.uri.path.toLowerCase().endsWith(".sc");
                return parseScOutline(model.getValue(), { classFile }).map(
                    (s) => this.toDocumentSymbol(model, s),
                );
            },
        });
    }

    protected toDocumentSymbol(
        model: monaco.editor.ITextModel,
        s: ScSymbol,
    ): monaco.languages.DocumentSymbol {
        const range = (start: number, end: number) =>
            monaco.Range.fromPositions(
                model.getPositionAt(start),
                model.getPositionAt(end),
            );
        return {
            name: s.name,
            detail: s.kind === "extension" ? "extension" : "",
            kind: KINDS[s.kind],
            tags: [],
            range: range(s.start, s.end),
            selectionRange: range(s.nameStart, s.nameEnd),
            children: s.children.map((c) => this.toDocumentSymbol(model, c)),
        };
    }
}
