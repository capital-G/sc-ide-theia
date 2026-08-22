import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import { InterpreterState, SC_CLASS_REGEX, ScService } from "../common/protocol";
import { ScClientImpl } from "./sc-client-impl";
import * as monaco from '@theia/monaco-editor-core';
import { SC_LANGUAGE_ID } from "./sc-language-contribution";

@injectable()
export class ScAutocomplete implements FrontendApplicationContribution {
    @inject(ScService) protected readonly scService! : ScService;
    @inject(ScClientImpl) protected readonly client! : ScClientImpl;

    protected state: InterpreterState = { kind: 'stopped' };

    onStart(): void {
        this.client.onStateChangedEvent(state => this.state = state);
        monaco.languages.registerCompletionItemProvider(SC_LANGUAGE_ID, {
            provideCompletionItems: (model, position, context, token) =>
                this.complete(model, position, token)
        })
    }

    protected async complete(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        token: monaco.CancellationToken
    ): Promise<monaco.languages.CompletionList | undefined> {
        if (this.state.kind !== "running" || !this.state.compiled) { return undefined; };
        const word = model.getWordUntilPosition(position);
        // check only classes for now
        if(!SC_CLASS_REGEX.test(word.word)) { return undefined; }

        const names = await this.scService.query('complete', word.word);
        if (token.isCancellationRequested) { return undefined; };

        const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
        };

        return {
            incomplete: true,
            suggestions: names.map(name => ({
                label: name,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: name,
                range
            })),
        };
    }

}