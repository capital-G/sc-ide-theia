/**
 * Generated using theia-extension-generator
 */
import { ScCommandContribution } from "./sc-contribution";
import {
    CommandContribution,
    PreferenceContribution,
} from "@theia/core/lib/common";
import { ContainerModule } from "@theia/core/shared/inversify";
import { SC_SERVICE_PATH, ScClient, ScService } from "../common/protocol";
import {
    FrontendApplicationContribution,
    KeybindingContribution,
    RemoteConnectionProvider,
    ServiceConnectionProvider,
} from "@theia/core/lib/browser";
import { ScClientImpl } from "./sc-client-impl";
import { ScPostWindow } from "./sc-post-window";
import { FlashDecoration } from "./sc-flash-decoration";
import { LanguageGrammarDefinitionContribution } from "@theia/monaco/lib/browser/textmate";
import { ScLanguageContribution } from "./sc-language-contribution";
import { ScPreferenceContribution } from "./sc-preferences";
import { ScDefaultLanguage } from "./sc-default-language";
import { ScAutocomplete } from "./sc-autocomplete";

export default new ContainerModule((bind) => {
    bind(ScClientImpl).toSelf().inSingletonScope();
    bind(ScClient).toService(ScClientImpl);
    bind(ScCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).to(ScCommandContribution);
    bind(KeybindingContribution).toService(ScCommandContribution);
    bind(FlashDecoration).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution)
        .to(ScLanguageContribution)
        .inSingletonScope();
    bind(PreferenceContribution)
        .to(ScPreferenceContribution)
        .inSingletonScope();
    bind(ScDefaultLanguage).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScDefaultLanguage);
    bind(ScAutocomplete).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScAutocomplete);
    bind(FrontendApplicationContribution).toService(ScCommandContribution);

    bind(ScService)
        .toDynamicValue((ctx) => {
            const provider = ctx.container.get<ServiceConnectionProvider>(
                RemoteConnectionProvider,
            );
            return provider.createProxy<ScService>(
                SC_SERVICE_PATH,
                ctx.container.get(ScClientImpl),
            );
        })
        .inSingletonScope();

    bind(ScPostWindow).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScPostWindow);
});
