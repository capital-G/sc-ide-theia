import { SC_CLASS_REGEX, SC_METHOD_NAME } from "../common/protocol";
import { parseMethodPrefix } from "./sc-call-context";

/** what to look up for the symbol under the cursor */
export type ScSymbolTarget =
    | { kind: "class"; name: string }
    | { kind: "method"; name: string; receiver?: string };

/**
 * Decides if a word is a class or a method, e.g.
 * `SinOsc` in `SinOsc.ar` is a class and `ar` is a method w/ receiver `SinOsc`.
 *
 * @param linePrefix line content up to the *end* of the word
 * @param word the whole word under the cursor
 */
export function symbolTarget(
    linePrefix: string,
    word: string,
): ScSymbolTarget | undefined {
    if (!word || !linePrefix.endsWith(word)) {
        return undefined;
    }
    // `\foo` is a symbol literal and not a method
    if (linePrefix[linePrefix.length - word.length - 1] === "\\") {
        return undefined;
    }
    const call = parseMethodPrefix(linePrefix);
    if (call && call.prefix === word) {
        return { kind: "method", name: word, receiver: call.receiver };
    }
    if (SC_CLASS_REGEX.test(word)) {
        return { kind: "class", name: word };
    }
    if (SC_METHOD_NAME.test(word)) {
        return { kind: "method", name: word };
    }
    return undefined;
}

export interface ScSourcePosition {
    /** 1-based */
    lineNumber: number;
    /** 1-based, in UTF-16 code units like monaco */
    column: number;
    /** length of the declared name, 0 if none was found */
    length: number;
}

// `*ar {` for class methods, `ar {` for instance methods, `SinOsc : UGen` for classes
const DECLARED_NAME = /^\s*\*?([A-Za-z_][A-Za-z0-9_]*)/;
// binary operator methods, e.g. `+ { arg aNumber; ... }`
const DECLARED_OPERATOR = /^\s*([^\sA-Za-z0-9_{]+)/;
// enough to skip leading whitespace and to read the name
const NAME_WINDOW_BYTES = 256;

/**
 * sclang reports `charPos` as a byte offset into the UTF-8 file, while monaco
 * works w/ lines and UTF-16 columns.
 * The position is moved onto the declared name, as `Method.charPos` points at
 * the start of the line.
 */
export function sourcePosition(
    bytes: Uint8Array,
    charPos: number,
): ScSourcePosition | undefined {
    if (charPos < 0 || charPos > bytes.length) {
        return undefined;
    }
    const decoder = new TextDecoder("utf-8");
    const head = decoder.decode(bytes.subarray(0, charPos));
    const tail = decoder.decode(
        bytes.subarray(charPos, charPos + NAME_WINDOW_BYTES),
    );

    const match = DECLARED_NAME.exec(tail) ?? DECLARED_OPERATOR.exec(tail);
    const name = match?.[1] ?? "";
    const skip = match ? match[0].length - name.length : 0;

    const text = head + tail.slice(0, skip);
    const lastBreak = text.lastIndexOf("\n");
    let lineNumber = 1;
    for (let i = 0; i <= lastBreak; i++) {
        if (text.charCodeAt(i) === 10) {
            lineNumber++;
        }
    }
    return {
        lineNumber,
        column: text.length - lastBreak,
        length: name.length,
    };
}
