import { ContainerModule } from "@theia/core/shared/inversify";
import { ScServerWatcherService, ScService } from "../common/protocol";
import { ScServiceBrowser } from "./sc-service-browser";
import { ScServerWatcherBrowser } from "./sc-server-watcher-browser";

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(ScServiceBrowser).toSelf().inSingletonScope();
    (isBound(ScService) ? rebind : bind)(ScService).toService(ScServiceBrowser);
    bind(ScServerWatcherBrowser).toSelf().inSingletonScope();
    (isBound(ScServerWatcherService) ? rebind : bind)(
        ScServerWatcherService,
    ).toService(ScServerWatcherBrowser);
});
