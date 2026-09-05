export interface EvalRange {
    /** inclusive start offset */
    readonly start: number;
    /** exclusive end offset */
    readonly end: number;
    readonly kind: "region" | "line";
}

/**
 * Counts "(" and ")" from the top of the document.
 * The top level group within the cursior is a region if its `(` is in column 0, otherwise the current line.
 */
export function evalRangeAt(text: string, offset: number): EvalRange {
    let depth = 0;
    let groupStart = -1;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "(") {
            if (depth === 0) {
                groupStart = i;
            }
            depth++;
        } else if (ch === ")") {
            if (depth > 0) {
                depth--;
            }
            if (depth == 0 && groupStart >= 0) {
                if (groupStart <= offset && offset <= i + 1) {
                    const column =
                        groupStart -
                        (text.lastIndexOf("\n", groupStart - 1) + 1);
                    if (column === 0) {
                        return {
                            start: groupStart + 1,
                            end: i,
                            kind: "region",
                        };
                    }
                    break;
                }
                groupStart = -1;
            }
        }
    }

    let start = offset;
    while (start > 0 && text[start - 1] !== "\n") {
        start--;
    }
    let end = offset;
    while (end < text.length && text[end] !== "\n") {
        end++;
    }
    return { start, end, kind: "line" };
}
