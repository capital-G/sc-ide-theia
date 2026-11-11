/**
 * Generated using theia-extension-generator
 */
import "../../src/browser/style/index.css";
import { ScCommandContribution, ScStopServer } from "./sc-contribution";
import {
    CommandContribution,
    PreferenceContribution,
} from "@theia/core/lib/common";
import { ContainerModule } from "@theia/core/shared/inversify";
import {
    SC_SERVER_WATCHER_PATH,
    SC_SERVICE_PATH,
    ScClient,
    ScServerWatcherClient,
    ScServerWatcherService,
    ScService,
} from "../common/protocol";
import {
    FrontendApplicationContribution,
    KeybindingContribution,
    RemoteConnectionProvider,
    WidgetFactory,
    bindViewContribution,
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
import { ScDefinitionProvider } from "./sc-definition";
import { ScOutlineProvider } from "./sc-outline";
import {
    SC_HELP_WIDGET_ID,
    ScBackendHelpTransport,
    ScHelpKeyCommands,
    ScHelpTransport,
    ScHelpWidget,
} from "./sc-help-widget";
import { ScHelpViewContribution } from "./sc-help-contribution";
import { TabBarToolbarContribution } from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { ScStatusBarContribution } from "./sc-statusbar";
import { ScServerStatus } from "./sc-server-status";
import { ScServerWatcherClientImpl } from "./sc-server-watcher-client-impl";
import { ScColorContribution } from "./sc-color-contribution";
import { ColorContribution } from "@theia/core/lib/browser/color-application-contribution";
import { ScThemeContribution } from "./sc-themes";
import {
    SC_CLASS_LIBRARY_WIDGET_ID,
    ScClassLibraryViewContribution,
    createScClassLibraryWidget,
} from "./sc-class-library-widget";
import {
    ScClassLibraryLocator,
    ScLangClassLibraryLocator,
} from "./sc-class-library-locator";
import { QuickFileSelectService } from "@theia/file-search/lib/browser/quick-file-select-service";
import { ScQuickFileSelectService } from "./sc-quick-file-select";
import { ScFaviconContribution } from "./sc-favicon";
import {
    ScFileLangPathResolver,
    ScLangPathResolver,
} from "./sc-lang-path-resolver";
import {
    SC_LANGUAGE_CONFIG_PATH,
    ScLanguageConfigService,
} from "../common/sc-language-config";
import {
    ScLanguagePreferenceContribution,
    ScNativeEnvironment,
} from "./sc-language-preferences";
import { ScLaunchOptionsSync } from "./sc-launch-options";
import {
    SC_LANGUAGE_SETTINGS_WIDGET_ID,
    ScLanguageSettingsWidget,
} from "./sc-language-settings-widget";
import { ScLanguageSettingsContribution } from "./sc-language-settings-contribution";
import {
    SC_NODE_TREE_WIDGET_ID,
    ScNodeTreeWidget,
} from "./node-tree/sc-node-tree-widget";
import { ScNodeTreeContribution } from "./node-tree/sc-node-tree-contribution";
import { ScSidebarActions } from "./sc-sidebar-actions";

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(ScClientImpl).toSelf().inSingletonScope();
    bind(ScClient).toService(ScClientImpl);
    bind(ScServerWatcherClientImpl).toSelf().inSingletonScope();
    bind(ScServerWatcherClient).toService(ScServerWatcherClientImpl);
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
    bind(ScStatusBarContribution).toSelf().inSingletonScope();
    bind(ScServerStatus).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScServerStatus);
    bind(FrontendApplicationContribution).toService(ScAutocomplete);
    bind(ScDefinitionProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScDefinitionProvider);
    bind(ScOutlineProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScOutlineProvider);
    bind(FrontendApplicationContribution).toService(ScCommandContribution);
    bind(FrontendApplicationContribution).toService(ScStatusBarContribution);
    bind(ScColorContribution).toSelf().inSingletonScope();
    bind(ColorContribution).toService(ScColorContribution);
    bind(ScThemeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScThemeContribution);

    bind(ScFaviconContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScFaviconContribution);

    // the wasm frontend-only module rebinds these to its MEMFS
    bind(ScLangPathResolver).to(ScFileLangPathResolver).inSingletonScope();
    bind(ScClassLibraryLocator)
        .to(ScLangClassLibraryLocator)
        .inSingletonScope();
    bindViewContribution(bind, ScClassLibraryViewContribution);
    bind(FrontendApplicationContribution).toService(
        ScClassLibraryViewContribution,
    );
    bind(WidgetFactory)
        .toDynamicValue((ctx) => ({
            id: SC_CLASS_LIBRARY_WIDGET_ID,
            createWidget: () => createScClassLibraryWidget(ctx.container),
        }))
        .inSingletonScope();
    // help browser, the wasm frontend-only module rebinds the transport to its service worker
    bind(ScHelpTransport).to(ScBackendHelpTransport).inSingletonScope();
    bind(ScHelpKeyCommands).toConstantValue({ stop: ScStopServer.id });
    bind(ScHelpWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue((ctx) => ({
            id: SC_HELP_WIDGET_ID,
            createWidget: () => ctx.container.get(ScHelpWidget),
        }))
        .inSingletonScope();
    bindViewContribution(bind, ScHelpViewContribution);
    bind(TabBarToolbarContribution).toService(ScHelpViewContribution);
    bind(FrontendApplicationContribution).toService(ScHelpViewContribution);

    bind(ScQuickFileSelectService).toSelf().inSingletonScope();
    (isBound(QuickFileSelectService) ? rebind : bind)(
        QuickFileSelectService,
    ).toService(ScQuickFileSelectService);

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

    bind(ScServerWatcherService)
        .toDynamicValue((ctx) => {
            const provider = ctx.container.get<ServiceConnectionProvider>(
                RemoteConnectionProvider,
            );
            return provider.createProxy<ScServerWatcherService>(
                SC_SERVER_WATCHER_PATH,
                ctx.container.get(ScServerWatcherClient),
            );
        })
        .inSingletonScope();

    bind(ScPostWindow).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScPostWindow);

    // language settings of the native sclang, the wasm frontend-only module rebinds this to false
    bind(ScNativeEnvironment).toConstantValue({ native: true });
    bind(ScLanguageConfigService)
        .toDynamicValue((ctx) =>
            ctx.container
                .get<ServiceConnectionProvider>(RemoteConnectionProvider)
                .createProxy<ScLanguageConfigService>(SC_LANGUAGE_CONFIG_PATH),
        )
        .inSingletonScope();
    bind(PreferenceContribution)
        .to(ScLanguagePreferenceContribution)
        .inSingletonScope();
    bind(ScLaunchOptionsSync).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScLaunchOptionsSync);
    bind(ScLanguageSettingsWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue((ctx) => ({
            id: SC_LANGUAGE_SETTINGS_WIDGET_ID,
            createWidget: () => ctx.container.get(ScLanguageSettingsWidget),
        }))
        .inSingletonScope();
    bindViewContribution(bind, ScLanguageSettingsContribution);
    bind(FrontendApplicationContribution).toService(
        ScLanguageSettingsContribution,
    );

    // node tree of the server, both builds
    bind(ScNodeTreeWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue((ctx) => ({
            id: SC_NODE_TREE_WIDGET_ID,
            createWidget: () => ctx.container.get(ScNodeTreeWidget),
        }))
        .inSingletonScope();
    bindViewContribution(bind, ScNodeTreeContribution);

    // buttons in the left bar, e.g. a new scope or the node tree
    bind(ScSidebarActions).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScSidebarActions);
});
