import { DecorationStyle } from "@theia/core/lib/browser";
import { injectable, postConstruct } from "@theia/core/shared/inversify";
import { EditorDecorator, Range, TextEditor, TrackedRangeStickiness } from "@theia/editor/lib/browser";

const FLASH_CLASS = "sclang-flash";

/**
 * Adds a "flash" for the just evaluated section.
 */
@injectable()
export class FlashDecoration extends EditorDecorator {
    /** pending removal timers, using editor uri */
    protected readonly timers = new Map<string, number>();

    @postConstruct()
    protected init(): void {
        const sheet = DecorationStyle.createStyleSheet("sclang-decorations");
        const rule = DecorationStyle.getOrCreateStyleRule(`.${FLASH_CLASS}`, sheet);
        rule.style.backgroundColor = 'var(--theia-editor-findMatchHighlightBackground)';
        rule.style.borderRadius = '2px';
    }

    flash(editor: TextEditor, range: Range, durationMs: number = 300): void {
        const uri = editor.uri.toString();
        const pending = this.timers.get(uri);
        if(pending !== undefined) {
            // restart flash on fast eval
            window.clearTimeout(pending);
        }

        this.setDecorations(editor, [{
            range,
            options: {
                className: FLASH_CLASS,
                stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            }
        }]);

        this.timers.set(uri, window.setTimeout(() => {
            this.timers.delete(uri);
            try {
                this.setDecorations(editor, []);
            } catch {
                // editor was closed before the timer fired
            }
        }, durationMs));
    } 
}