import { ContainerModule } from "@theia/core/shared/inversify";
import { ScService } from "../common/protocol";
import { ScServiceBrowser } from "./sc-service-browser";

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(ScServiceBrowser).toSelf().inSingletonScope();
    (isBound(ScService) ? rebind : bind)(ScService).toService(ScServiceBrowser);
});
