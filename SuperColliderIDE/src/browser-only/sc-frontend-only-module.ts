import { ContainerModule } from "@theia/core/shared/inversify";
import { CommandContribution } from "@theia/core";
import { WidgetFactory } from "@theia/core/lib/browser";
import { ScServerWatcherService, ScService } from "../common/protocol";
import { ScServiceBrowser } from "./sc-service-browser";
import { ScServerWatcherBrowser } from "./sc-server-watcher-browser";
import { FileServiceContribution } from "@theia/filesystem/lib/browser/file-service";
import { ScLangPathResolver } from "../browser/sc-lang-path-resolver";
import { ScClassLibraryLocator } from "../browser/sc-class-library-locator";
import { ScHelpTransport } from "../browser/sc-help-widget";
import { ScServiceWorkerHelpTransport } from "./sc-help-sw-bridge";
import {
    ScMemfsClassLibraryLocator,
    ScMemfsLangPathResolver,
    SclangFsContribution,
} from "./sclang-fs-provider";
import {
    SC_AUDIO_SCOPE_FACTORY_ID,
    ScAudioScopeOptions,
    ScAudioScopeWidget,
} from "./sc-audio-scope-widget";
import { ScAudioScopeContribution } from "./sc-audio-scope-contribution";

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(ScServiceBrowser).toSelf().inSingletonScope();
    (isBound(ScService) ? rebind : bind)(ScService).toService(ScServiceBrowser);
    bind(ScServerWatcherBrowser).toSelf().inSingletonScope();
    (isBound(ScServerWatcherService) ? rebind : bind)(
        ScServerWatcherService,
    ).toService(ScServerWatcherBrowser);

    bind(SclangFsContribution).toSelf().inSingletonScope();
    bind(FileServiceContribution).toService(SclangFsContribution);
    bind(ScMemfsLangPathResolver).toSelf().inSingletonScope();
    (isBound(ScLangPathResolver) ? rebind : bind)(ScLangPathResolver).toService(
        ScMemfsLangPathResolver,
    );
    bind(ScServiceWorkerHelpTransport).toSelf().inSingletonScope();
    (isBound(ScHelpTransport) ? rebind : bind)(ScHelpTransport).toService(
        ScServiceWorkerHelpTransport,
    );
    bind(ScMemfsClassLibraryLocator).toSelf().inSingletonScope();
    (isBound(ScClassLibraryLocator) ? rebind : bind)(
        ScClassLibraryLocator,
    ).toService(ScMemfsClassLibraryLocator);

    bind(WidgetFactory)
        .toDynamicValue((ctx) => ({
            id: SC_AUDIO_SCOPE_FACTORY_ID,
            createWidget: (options?: ScAudioScopeOptions) => {
                const child = ctx.container.createChild();
                // scopes restored from an older layout have no options
                child
                    .bind(ScAudioScopeOptions)
                    .toConstantValue(options ?? { instance: 0 });
                child.bind(ScAudioScopeWidget).toSelf();
                return child.get(ScAudioScopeWidget);
            },
        }))
        .inSingletonScope();
    bind(ScAudioScopeContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ScAudioScopeContribution);
});
