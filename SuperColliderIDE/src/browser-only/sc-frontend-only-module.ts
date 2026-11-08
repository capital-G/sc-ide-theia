import { ContainerModule } from "@theia/core/shared/inversify";
import { ScServerWatcherService, ScService } from "../common/protocol";
import { ScServiceBrowser } from "./sc-service-browser";
import { ScServerWatcherBrowser } from "./sc-server-watcher-browser";
import { FileServiceContribution } from "@theia/filesystem/lib/browser/file-service";
import { ScLangPathResolver } from "../browser/sc-lang-path-resolver";
import { ScClassLibraryLocator } from "../browser/sc-class-library-locator";
import {
    ScMemfsClassLibraryLocator,
    ScMemfsLangPathResolver,
    SclangFsContribution,
} from "./sclang-fs-provider";

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
    bind(ScMemfsClassLibraryLocator).toSelf().inSingletonScope();
    (isBound(ScClassLibraryLocator) ? rebind : bind)(
        ScClassLibraryLocator,
    ).toService(ScMemfsClassLibraryLocator);
});
