import { UNTITLED_SCHEME } from "@theia/core";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import { EditorManager } from "@theia/editor/lib/browser";
import { SC_LANGUAGE_ID } from "./sc-language-contribution";

/**
 * Sets sclang as the default language for any new document.
 */
@injectable()
export class ScDefaultLanguage implements FrontendApplicationContribution {
    @inject(EditorManager) protected readonly editorManager!: EditorManager;
    
    onStart(): void {
        this.editorManager.onCreated(widget => {
            const editor = widget.editor;
            if (editor.uri.scheme === UNTITLED_SCHEME && editor.document.languageId === "plaintext") {
                editor.setLanguage(SC_LANGUAGE_ID);
            }
        })
    }
}
