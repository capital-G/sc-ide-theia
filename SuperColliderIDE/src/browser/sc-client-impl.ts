import { injectable } from "@theia/core/shared/inversify";
import { InterpreterState, LangMessage, ScClient } from "../common/protocol";
import { Emitter, Event } from "@theia/core";


@injectable()
export class ScClientImpl implements ScClient {
    protected readonly postEmitter = new Emitter<string>();
    readonly onPostEvent: Event<string> = this.postEmitter.event;

    protected readonly stateEmitter = new Emitter<InterpreterState>();
    readonly onStateChangedEvent: Event<InterpreterState> = this.stateEmitter.event;

    protected readonly langEmitter = new Emitter<LangMessage>();
    readonly onLangMessageEvent: Event<LangMessage> = this.langEmitter.event;

    onPost(chunk: string): void {
        this.postEmitter.fire(chunk);
    }

    onInterpreterStateChanged(state: InterpreterState): void {
        this.stateEmitter.fire(state);
    }

    onLangMessage(msg: LangMessage): void {
        this.langEmitter.fire(msg);
    }
}
