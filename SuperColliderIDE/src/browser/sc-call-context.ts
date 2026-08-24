import { SC_ARRAY, SC_CLASS_REGEX, SC_FUNCTION, SC_FLOAT, SC_INTEGER, SC_STRING, SC_SYMBOL, SC_METHOD_NAME } from "../common/protocol";

const IDENT = /[A-Za-z0-9_]/;
const SC_RECEIVER_SECTION = /(~?[A-Za-z_][A-Za-z0-9_]*|\\[A-Za-z0-9_]+|\d+(?:\.\d+)?)$/;

/** splits e.g. `SinOsc.a` into receiver: `SinOsc`, prefix: `a`, methodStart: <offset> */
export function parseMethodPrefix(linePrefix: string): {receiver?: string, prefix: string; methodStart: number } | undefined {
    let start = linePrefix.length;
    while (start > 0 && IDENT.test(linePrefix[start -1])) { start--; }
    const prefix= linePrefix.slice(start);

    const dot = start -1;
    if (dot <0 || linePrefix[dot] !== '.') { return undefined; }
    if (prefix.length > 0 && !SC_METHOD_NAME.test(prefix)) { return undefined; }

    return {
        receiver: SC_RECEIVER_SECTION.exec(linePrefix.slice(0, dot))?.[1],
        prefix,
        methodStart: start,
    }
}

/** guessing the receiving class */
export function guessReceiver(receiver: string): string | undefined {
    const t = receiver; //.trimEnd();

    if(SC_INTEGER.test(t)) { return "Integer" };
    if(SC_FLOAT.test(t)) { return "Float" };
    if(SC_ARRAY.test(t)) { return "Array" };
    if(SC_FUNCTION.test(t)) { return "Function" };
    if(SC_SYMBOL.test(t)) { return "Symbol" };
    if(SC_STRING.test(t)) { return "String" };
    if(SC_CLASS_REGEX.test(t)) { return t.match(SC_CLASS_REGEX)![0]; }

    // ~env and vars are runtime specific
    return undefined;
}

