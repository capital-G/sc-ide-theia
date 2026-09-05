import {
    SC_ARRAY,
    SC_CLASS_REGEX,
    SC_FUNCTION,
    SC_FLOAT,
    SC_INTEGER,
    SC_STRING,
    SC_SYMBOL,
    SC_METHOD_NAME,
    SC_CLASS_TAIL_REGEX,
    ScArg,
} from "../common/protocol";

const IDENT = /[A-Za-z0-9_]/;
const SC_RECEIVER_SECTION =
    /(~?[A-Za-z_][A-Za-z0-9_]*|\\[A-Za-z0-9_]+|\d+(?:\.\d+)?)$/;
const KEYWORD_HEAD = /^\s*([a-z][A-Za-z0-9_]*)\s*:/;

export interface ScMethodPrefix {
    receiver?: string;
    prefix: string;
    methodStart: number;
}

export interface ScArgSegment {
    /** offset of the first char after '(' or ',' */
    start: number;
    /** offset one past the last char - the ',' or the ') */
    end: number;
    /** the raw slice [start, end] */
    text: string;
    /** set when the segment is a keyword, i.e. 'name: ' */
    keyword?: string;
    /** trimmed text after the keyword or in general */
    value: string;
}

export interface ScCallContext {
    receiver?: string;
    method: string;
    /** written `Pwhite(` rather than `Pwhite.new(` */
    implicitNew: boolean;
    methodStart: number;
    /** offset of the `(` */
    open: number;
    /** a matching `)` was found inside the window */
    closed: boolean;
    segments: ScArgSegment[];
    cursorSegment: number;
    /** alias of cursorSegment, kept for the existing call sites */
    argIndex: number;
}

interface Frame {
    open: number;
    kind: "(" | "[" | "{";
    /** offstes where each segment begins; argStarts[0] === open + 1 */
    argStarts: number[];
    close?: number;
    /** first `;` seen while this frame was on top - an unclosed arg list has none */
    semi?: number;
}

interface ScCallHead {
    receiver?: string;
    method: string;
    methodStart: number;
    implicitNew: boolean;
}

/** splits e.g. `SinOsc.a` into receiver: `SinOsc`, prefix: `a`, methodStart: <offset> */
export function parseMethodPrefix(
    linePrefix: string,
): ScMethodPrefix | undefined {
    let start = linePrefix.length;
    while (start > 0 && IDENT.test(linePrefix[start - 1])) {
        start--;
    }
    const prefix = linePrefix.slice(start);

    const dot = start - 1;
    if (dot < 0 || linePrefix[dot] !== ".") {
        return undefined;
    }
    if (prefix.length > 0 && !SC_METHOD_NAME.test(prefix)) {
        return undefined;
    }

    return {
        receiver: SC_RECEIVER_SECTION.exec(linePrefix.slice(0, dot))?.[1],
        prefix,
        methodStart: start,
    };
}

/** guessing the receiving class */
export function guessReceiver(receiver: string): string | undefined {
    const t = receiver; //.trimEnd();

    if (SC_INTEGER.test(t)) {
        return "Integer";
    }
    if (SC_FLOAT.test(t)) {
        return "Float";
    }
    if (SC_ARRAY.test(t)) {
        return "Array";
    }
    if (SC_FUNCTION.test(t)) {
        return "Function";
    }
    if (SC_SYMBOL.test(t)) {
        return "Symbol";
    }
    if (SC_STRING.test(t)) {
        return "String";
    }
    if (SC_CLASS_REGEX.test(t)) {
        return t.match(SC_CLASS_REGEX)![0];
    }

    // ~env and vars are runtime specific
    return undefined;
}

function skipQuoted(text: string, i: number, quote: string): number {
    i++;
    while (i < text.length) {
        if (text[i] === "\\") {
            i += 2;
            continue;
        }
        if (text[i] === quote) {
            return i + 1;
        }
        i++;
    }
    return i;
}

function skipBlockComment(text: string, i: number): number {
    i += 2;
    let depth = 1;
    while (i < text.length && depth > 0) {
        if (text[i] === "/" && text[i + 1] === "*") {
            depth++;
            i += 2;
            continue;
        }
        if (text[i] === "*" && text[i + 1] === "/") {
            depth--;
            i += 2;
            continue;
        }
        i++;
    }
    return i;
}

/** Scan forward for closing bracket */
export function findCallContext(
    text: string,
    cursor: number = text.length,
): ScCallContext | undefined {
    const stack: Frame[] = [];
    // popped frames that still surround the cursor
    const spanning: Frame[] = [];
    let i = 0;

    while (i < text.length) {
        const c = text[i];

        if (c === '"' || c === "'") {
            const next = skipQuoted(text, i, c);
            // cursor inside string/symbol?
            if (i < cursor && next > cursor) {
                return undefined;
            }
            i = next;
            continue;
        }
        // $a is a char literal
        if (c === "$") {
            i += 2;
            continue;
        }

        // skip comments
        if (c === "/" && text[i + 1] === "/") {
            const nl = text.indexOf("\n", i);
            // cursor inside comment?
            if (nl < 0 || nl >= cursor) {
                return undefined;
            }
            i = nl + 1;
            continue;
        }
        if (c === "/" && text[i + 1] === "*") {
            const next = skipBlockComment(text, i);
            // cursor inside block comment?
            if (i < cursor && next > cursor) {
                return undefined;
            }
            i = next;
            continue;
        }

        if (c === "(" || c === "[" || c === "{") {
            stack.push({ open: i, kind: c, argStarts: [i + 1] });
            i++;
            continue;
        }
        if (c === ")" || c == "]" || c === "}") {
            const frame = stack.pop();
            if (frame) {
                frame.close = i;
                if (frame.open < cursor && i >= cursor) {
                    spanning.push(frame);
                }
            }
            i++;
            continue;
        }
        if (c === "," && stack.length > 0) {
            stack[stack.length - 1].argStarts.push(i + 1);
            i++;
            continue;
        }

        if (c === ";" && stack.length > 0) {
            // in case we don't have a closing `)` we may encounter a `;`
            // we will push everything that follows to the next frame.
            // Within a function `{ }` the argument belongs to that nested frame.
            const frame = stack[stack.length - 1];
            if (frame.semi === undefined) {
                frame.semi = i;
            }
            i++;
            continue;
        }
        i++;
    }

    const candidates = [...stack, ...spanning].filter(
        (f) =>
            f.kind === "(" &&
            f.open < cursor &&
            (f.close !== undefined
                ? f.close >= cursor
                : f.semi === undefined || f.semi >= cursor),
    );
    // sort by innermost
    candidates.sort((a, b) => b.open - a.open);

    for (const frame of candidates) {
        const head = headFor(text, frame.open);
        if (!head) continue;

        const end = frame.close ?? frame.semi ?? text.length;
        const segments = segmentsOf(text, frame, end);
        const at = segments.findIndex(
            (s) => cursor >= s.start && cursor <= s.end,
        );
        const cursorSegment = at < 0 ? segments.length - 1 : at;

        return {
            ...head,
            open: frame.open,
            closed: frame.close !== undefined,
            segments,
            cursorSegment,
            argIndex: cursorSegment,
        };
    }

    return undefined;
}

function headFor(text: string, open: number): ScCallHead | undefined {
    const before = text.slice(0, open);
    const dotted = parseMethodPrefix(before);
    if (dotted?.prefix) {
        return {
            receiver: dotted.receiver,
            method: dotted.prefix,
            methodStart: dotted.methodStart,
            implicitNew: false,
        };
    }

    // `Pwhite(` is syntax sugar for `Pwhite.new(`,
    // but we don't want to match `x = (foo + bar)` or top level `(`.
    // We can match for a capitalized identifier in front
    const cls = SC_CLASS_TAIL_REGEX.exec(before);
    if (cls && cls.index + cls[0].length === before.length) {
        return {
            receiver: cls[0],
            method: "new",
            methodStart: cls.index,
            implicitNew: true,
        };
    }

    return undefined;
}

function segmentsOf(text: string, frame: Frame, end: number): ScArgSegment[] {
    return frame.argStarts.map((start, i) => {
        // next segment start past its comma
        const stop =
            i + 1 < frame.argStarts.length ? frame.argStarts[i + 1] - 1 : end;
        const raw = text.slice(start, stop);
        const kw = KEYWORD_HEAD.exec(raw);
        return {
            start,
            end: stop,
            text: raw,
            keyword: kw?.[1],
            value: (kw ? raw.slice(kw[0].length) : raw).trim(),
        };
    });
}

/** arguments that do not have been asigned yet, in signature order */
export function remainingArgs(
    ctx: ScCallContext,
    args: ScArg[],
    cursorHead: string,
): ScArg[] {
    const specified = new Set<string>();
    // positional arguments must be upfront
    let positional = true;

    ctx.segments.forEach((seg, i) => {
        const raw = i === ctx.cursorSegment ? cursorHead : seg.text;
        const kw = KEYWORD_HEAD.exec(raw);
        const value = (kw ? raw.slice(kw[0].length) : raw).trim();
        if (kw) {
            positional = false;
        }
        // empty -> return
        if (value.length === 0) {
            return;
        }
        if (kw) {
            specified.add(kw[1]);
            return;
        }
        if (positional && args[i]) {
            specified.add(args[i].name);
        }
    });

    return args.filter((a) => !specified.has(a.name));
}
