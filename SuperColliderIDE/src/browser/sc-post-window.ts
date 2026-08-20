import { inject, injectable } from "@theia/core/shared/inversify";
import { OutputChannel, OutputChannelManager } from "@theia/output/lib/browser/output-channel";
import { ScClientImpl } from "./sc-client-impl";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";

@injectable()
export class ScPostWindow implements FrontendApplicationContribution {
    @inject(OutputChannelManager) protected readonly channels! : OutputChannelManager;
    @inject(ScClientImpl) protected readonly client! : ScClientImpl;

    protected channel: OutputChannel | undefined;

    onStart(): void {
        this.channel = this.channels.getChannel("sclang");
        // append b/c sclang already adds \n
        this.client.onPostEvent(chunk => this.channel!.append(chunk));
        this.client.onStateChangedEvent(state => {
            if(state.kind === 'running') {
                this.channel!.show({ preserveFocus: true });
            }
        });
    }
}
