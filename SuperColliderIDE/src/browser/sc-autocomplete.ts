import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import { InterpreterState, SC_CLASS_REGEX, SC_ENV_REGEX, SC_QUERY_LIMIT, ScArg, ScMethodRef, ScMethodSide, ScService } from "../common/protocol";
import { ScClientImpl } from "./sc-client-impl";
import * as monaco from '@theia/monaco-editor-core';
import { SC_LANGUAGE_ID } from "./sc-language-contribution";
import { findCallContext, guessReceiver, parseMethodPrefix, ScCallContext, ScMethodPrefix } from "./sc-call-context";
import { ScRememberImplCommand } from "./sc-contribution";


interface ScCompletionItem extends monaco.languages.CompletionItem {
    scRef: ScMethodRef
}

@injectable()
export class ScAutocomplete implements FrontendApplicationContribution {
    @inject(ScService) protected readonly scService! : ScService;
    @inject(ScClientImpl) protected readonly client! : ScClientImpl;

    protected state: InterpreterState = { kind: 'stopped' };
    
    // arg caching for signature help
    activeHelp: {args: ScArg[]; index: number} | undefined;
    private readonly argCache = new Map<string, ScArg[]>();
    private readonly picks = new Map<string, ScMethodRef>();
    // max lines to look ahead for searching end of brackets enclosure
    private static readonly SCAN_LINES = 50;
    private static key(ref: ScMethodRef): string {
        return `${ref.ownerClass}:${ref.isClassMethod ? '*' : ''}${ref.name}`;
    }


    onStart(): void {
        this.client.onStateChangedEvent(state => {
            // reset arg cache when restarting the interpreter
            // b/c the state of the class library signatures could have changed
            if(state.kind !== "running" || !state.compiled) { this.argCache.clear(); }
            this.state = state;
        });

        monaco.languages.registerCompletionItemProvider(SC_LANGUAGE_ID, {
            triggerCharacters: ["."],
            provideCompletionItems: (model, position, context, token) => this.complete(model, position, token),
            // resolveCompletionItem: (item, token) => this.resolve(item as ScCompletionItem, token),
        });

        monaco.languages.registerSignatureHelpProvider(SC_LANGUAGE_ID, {
            signatureHelpTriggerCharacters: ["(", ","],
            signatureHelpRetriggerCharacters: [","],
            provideSignatureHelp: (model, position, token, context) => this.signatureHelp(model, position, token)
        });
    }

    protected async complete(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        token: monaco.CancellationToken
    ): Promise<monaco.languages.CompletionList | undefined> {
        if (this.state.kind !== "running" || !this.state.compiled) { return undefined; };
        const word = model.getWordUntilPosition(position);
        const linePrefix = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
        });
        const call = parseMethodPrefix(linePrefix);
        if(call) { return this.completeMethods(model, call, position, token); };
        if(SC_CLASS_REGEX.test(word.word)) { return this.completeClass(word, position, token); }
        return undefined;

    }

    private async completeClass(word: monaco.editor.IWordAtPosition, position: monaco.Position, token: monaco.CancellationToken) : Promise<monaco.languages.CompletionList | undefined> {
        const names = await this.scService.queryClass(word.word);
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

    private async completeMethods(
        model: monaco.editor.ITextModel,
        call: ScMethodPrefix,
        position: monaco.Position,
        token: monaco.CancellationToken,
    ): Promise<monaco.languages.CompletionList | undefined> {
        // class hint and side origin from different things
        // `42.midicps` is Integer, but instance-side
        const receiverClass = call.receiver ? guessReceiver(call.receiver) : undefined;
        const side: ScMethodSide | undefined = call.receiver
            ? (SC_CLASS_REGEX.test(call.receiver) ? "class" : "instance")
            :undefined;
        
        const refs = await this.scService.queryMethod(call.prefix, receiverClass, side);
        if(token.isCancellationRequested) { return undefined; };

        const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: call.methodStart + 1, // colmns are 1 based!
            endColumn: position.column,
        }

        const suggestions: ScCompletionItem[] = refs.map((ref, index) => ({
            label: { label: ref.name, description: ref.ownerClass },
            range,
            scRef: ref,
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: ref.name,
            filterText: `${ref.name}${ref.ownerClass}`,
            // use the sc index here
            sortText: String(index).padStart(5, '0'),
            // insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            command: {
                id: ScRememberImplCommand.id,
                title: '',
                arguments: [ref, model.uri.toString()]
            }
        }))
        return {
            incomplete: refs.length >= SC_QUERY_LIMIT,
            suggestions,
        };
    }

    private async signatureHelp(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        token: monaco.CancellationToken,
    ): Promise<monaco.languages.SignatureHelpResult | undefined> {
        if (this.state.kind !== "running" || !this.state.compiled) { return undefined; }

        const text = model.getValueInRange({
            startLineNumber: Math.max(1, position.lineNumber - ScAutocomplete.SCAN_LINES),
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
        });
        const ctx = findCallContext(text);
        if(!ctx) {this.activeHelp = undefined; return undefined;}

        const ref = await this.refFor(model, ctx);
        if(!ref || token.isCancellationRequested) { return undefined; }
        const args = await this.argsFor(ref);
        if(!args?.length || token.isCancellationRequested) { return undefined; }

        let label = `${ref.name}(`;
        const parameters: monaco.languages.ParameterInformation[] = args.map((a, i) => {
            const shown = a.default !== undefined ? `${a.name}: ${a.default}` : a.name;
            const start = label.length;
            label += shown + (i < args.length -1 ? ", " : "");
            return {
                label: [start, start + shown.length] as [number, number]
            }
        })
        label += ')';

        const index = Math.min(ctx.argIndex, args.length - 1);
        this.activeHelp = {args, index};

        return {
            value: {
                signatures: [{label, documentation: ScAutocomplete.key(ref), parameters}],
                activeSignature: 0,
                activeParameter: index,
            },
            dispose: () => {}
        }
    }

    /** cache access for the args of a sc method ref */
    private async argsFor(ref: ScMethodRef): Promise<ScArg[] | undefined> {
        const key = ScAutocomplete.key(ref);
        const hit = this.argCache.get(key);
        if(hit) {return hit};
        const args = await this.scService.queryArgs(ref);
        if (args) {this.argCache.set(key, args);}
        return args;
    }

    /** resolves which implementation to choose */
    private async refFor(model: monaco.editor.ITextModel, context: ScCallContext): Promise<ScMethodRef | undefined> {
        // first: literal or class receivers
        let cls = context.receiver ? guessReceiver(context.receiver) : undefined;

        // second: todo: ask language what the env variable ~foo has access to
        if(!cls && context.receiver && SC_ENV_REGEX.test(context.receiver)) {
            // remove ~ for query
            cls = await this.scService.queryEnvClass(context.receiver.slice(1));
        }

        if (cls) {
            const side: ScMethodSide = SC_CLASS_REGEX.test(context.receiver!) ? 'class' : 'instance';
            const refs = await this.scService.queryMethod(context.method, cls, side);
            if (refs.length) { return refs[0]; }
        }

        // third: the implementation picked by the user
        const picked = this.picks.get(`${model.uri.toString()}#${context.method}`);
        if (picked) { return picked; }

        // last: global match - this may lead to false things, so maybe avoid it all together?
        return (await this.scService.queryMethod(context.method))[0];
    }

    /** Gets called when a method implementationwas selected from autocomplete
     *  so we can pick this up later.
     *  This gets invoked through a command.
     */
    remember(uri: string, ref: ScMethodRef): void {
        this.picks.set(`${uri}#${ref.name}`, ref);
    }
}
