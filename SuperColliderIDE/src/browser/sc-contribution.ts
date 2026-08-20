import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { ScService } from '../common/protocol';


export const SclangStartCommand : Command = {
    id: 'sclang.start',
    label: "Start sclang",
    category: "SuperCollider",
}

export const SclangEvalTestCommand : Command = {
    id: "sclang.evalTest",
    label: "Eval sclang test",
    category: "SuperCollider",
}

@injectable()
export class ScCommandContribution implements CommandContribution {
    @inject(ScService) protected readonly scService!: ScService;
    
    @inject(MessageService)
    protected readonly messageService!: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(SclangStartCommand, {
            execute: () => {
                this.messageService.info('Starting sclang');
                this.scService.startInterpreter();
            }
        });
        
        registry.registerCommand(SclangEvalTestCommand, {
            execute: () => {
                this.messageService.info("Eval test");
                this.scService.evaluate("2+2");
            }
        })
    }
}
