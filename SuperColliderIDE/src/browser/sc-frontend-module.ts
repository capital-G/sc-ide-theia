/**
 * Generated using theia-extension-generator
 */
import { ScCommandContribution } from './sc-contribution';
import { CommandContribution } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import { SC_SERVICE_PATH, ScService } from '../common/protocol';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';

export default new ContainerModule(bind => {
    bind(CommandContribution).to(ScCommandContribution);

    bind(ScService).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return provider.createProxy<ScService>(SC_SERVICE_PATH);
    }).inSingletonScope();

    
});
