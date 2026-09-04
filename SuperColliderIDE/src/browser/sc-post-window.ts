import { inject, injectable } from "@theia/core/shared/inversify";
import { OutputChannel, OutputChannelManager } from "@theia/output/lib/browser/output-channel";
import { OutputContribution } from "@theia/output/lib/browser/output-contribution";
import { ScClientImpl } from "./sc-client-impl";
import { FrontendApplication, FrontendApplicationContribution } from "@theia/core/lib/browser";

@injectable()
export class ScPostWindow implements FrontendApplicationContribution {
    @inject(OutputChannelManager) protected readonly channels! : OutputChannelManager;
    @inject(OutputContribution) protected readonly output!: OutputContribution;
    @inject(ScClientImpl) protected readonly client! : ScClientImpl;

    protected channel: OutputChannel | undefined;

    onStart(): void {
        this.channel = this.channels.getChannel("sclang");
        // append b/c sclang already adds \n
        this.client.onPostEvent(chunk => this.channel!.append(chunk));
    }

    async onDidInitializeLayout(app: FrontendApplication): Promise<void> {
        await this.output.openView({ activate: false, reveal: true });
        this.channel?.show({ preserveFocus: true });
    }
}
