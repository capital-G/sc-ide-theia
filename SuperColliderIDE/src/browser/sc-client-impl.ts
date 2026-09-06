import { injectable } from "@theia/core/shared/inversify";
import { InterpreterState, ScClient } from "../common/protocol";
import { Emitter, Event } from "@theia/core";
import { ScTheiaMessage } from "../common/sc-service-core";

@injectable()
export class ScClientImpl implements ScClient {
    protected readonly postEmitter = new Emitter<string>();
    readonly onPostEvent: Event<string> = this.postEmitter.event;

    protected readonly stateEmitter = new Emitter<InterpreterState>();
    readonly onStateChangedEvent: Event<InterpreterState> =
        this.stateEmitter.event;

    protected readonly langEmitter = new Emitter<ScTheiaMessage>();
    readonly onLangMessageEvent: Event<ScTheiaMessage> = this.langEmitter.event;

    onPost(chunk: string): void {
        this.postEmitter.fire(chunk);
    }

    onInterpreterStateChanged(state: InterpreterState): void {
        this.stateEmitter.fire(state);
    }

    onLangMessage(msg: ScTheiaMessage): void {
        this.langEmitter.fire(msg);
    }
}
