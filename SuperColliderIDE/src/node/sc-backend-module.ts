import { ContainerModule } from "@theia/core/shared/inversify";
import { ConnectionHandler, RpcConnectionHandler } from "@theia/core";
import {
    ScClient,
    ScService,
    SC_SERVICE_PATH,
    ScServerWatcherClient,
    SC_SERVER_WATCHER_PATH,
    ScServerWatcherService,
} from "../common/protocol";
import { ScServiceImpl } from "./sc-service-impl";
import { BackendApplicationContribution } from "@theia/core/lib/node";
import { ScServerWatcherServiceImpl } from "./sc-server-watcher-service-impl";

export default new ContainerModule((bind) => {
    bind(ScServiceImpl).toSelf().inSingletonScope();
    bind(ScService).toService(ScServiceImpl);
    bind(BackendApplicationContribution).toService(ScServiceImpl);

    bind(ScServerWatcherServiceImpl).toSelf().inSingletonScope();
    bind(ScServerWatcherService).toService(ScServerWatcherServiceImpl);
    bind(BackendApplicationContribution).toService(ScServerWatcherServiceImpl);

    bind(ConnectionHandler)
        .toDynamicValue((ctx) => {
            return new RpcConnectionHandler<ScClient>(
                SC_SERVICE_PATH,
                (client) => {
                    const server = ctx.container.get(ScServiceImpl);
                    server.setClient(client);
                    client.onDidCloseConnection(() =>
                        server.setClient(undefined),
                    );
                    return server;
                },
            );
        })
        .inSingletonScope();

    bind(ConnectionHandler)
        .toDynamicValue((ctx) => {
            return new RpcConnectionHandler<ScServerWatcherClient>(
                SC_SERVER_WATCHER_PATH,
                (client) => {
                    const server = ctx.container.get(
                        ScServerWatcherServiceImpl,
                    );
                    server.setClient(client);
                    client.onDidCloseConnection(() =>
                        server.setClient(undefined),
                    );
                    return server;
                },
            );
        })
        .inSingletonScope();
});
