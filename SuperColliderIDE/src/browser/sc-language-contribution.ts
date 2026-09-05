import { injectable } from "@theia/core/shared/inversify";
import * as monaco from "@theia/monaco-editor-core";
import {
    LanguageGrammarDefinitionContribution,
    TextmateRegistry,
} from "@theia/monaco/lib/browser/textmate";
import * as grammar from "./data/supercollider.tmLanguage.json";

export const SC_LANGUAGE_ID = "sclang";
const SC_SCOPE = "source.supercollider";

/**
 * Defines the syntax highlighting and the definition of sclang for the editor.
 */
@injectable()
export class ScLanguageContribution implements LanguageGrammarDefinitionContribution {
    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: SC_LANGUAGE_ID,
            extensions: [".scd", ".sc", ".quark"],
            aliases: ["SuperCollider", "supercollider", "sclang"],
            firstLine: "^#!.*sclang",
        });

        monaco.languages.setLanguageConfiguration(SC_LANGUAGE_ID, {
            comments: { lineComment: "//", blockComment: ["/*", "*/"] },
            brackets: [
                ["{", "}"],
                ["[", "]"],
                ["(", ")"],
            ],
            autoClosingPairs: [
                { open: "{", close: "}" },
                { open: "[", close: "]" },
                { open: "(", close: ")" },
                { open: '"', close: '"', notIn: ["string", "comment"] },
            ],
            surroundingPairs: [
                { open: "{", close: "}" },
                { open: "[", close: "]" },
                { open: "(", close: ")" },
                { open: '"', close: '"' },
            ],
        });

        registry.registerTextmateGrammarScope(SC_SCOPE, {
            async getGrammarDefinition() {
                return {
                    format: "json",
                    content: grammar as unknown as object,
                };
            },
        });

        registry.mapLanguageIdToTextmateGrammar(SC_LANGUAGE_ID, SC_SCOPE);
    }
}
