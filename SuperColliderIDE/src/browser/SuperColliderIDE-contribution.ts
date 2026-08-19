import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MessageService } from '@theia/core/lib/common';
import { CommonMenus } from '@theia/core/lib/browser';

export const SuperColliderIDECommand: Command = {
    id: 'SuperColliderIDE.command',
    label: 'Say Hello'
};

@injectable()
export class SuperColliderIDECommandContribution implements CommandContribution {
    
    @inject(MessageService)
    protected readonly messageService!: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(SuperColliderIDECommand, {
            execute: () => this.messageService.info('Hello World!')
        });
    }
}

@injectable()
export class SuperColliderIDEMenuContribution implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: SuperColliderIDECommand.id,
            label: SuperColliderIDECommand.label
        });
    }
}
