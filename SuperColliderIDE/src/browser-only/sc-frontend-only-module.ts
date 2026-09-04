import { ContainerModule } from "@theia/core/shared/inversify";
import { ScService } from "../common/protocol";
import { ScServiceStub } from "./sc-service-stub";

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(ScServiceStub).toSelf().inSingletonScope();
    (isBound(ScService) ? rebind : bind)(ScService).toService(ScServiceStub);
});
