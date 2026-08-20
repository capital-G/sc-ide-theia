import { PreferenceContribution, PreferenceSchemaService } from "@theia/core";
import { injectable } from "@theia/core/shared/inversify";
import { SC_LANGUAGE_ID } from "./sc-language-contribution";

/**
 * Allows to define global preferences to match SuperColliders style.
 */
@injectable()
export class ScPreferenceContribution implements PreferenceContribution {
    async initSchema(service: PreferenceSchemaService): Promise<void> {
        service.registerOverride("editor.insertSpaces", SC_LANGUAGE_ID, false);
        service.registerOverride("editor.tabSize", SC_LANGUAGE_ID, 4);
        service.registerOverride("editor.detectIndentation", SC_LANGUAGE_ID, false);
    }
}
