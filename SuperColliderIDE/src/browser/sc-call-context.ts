import { SC_ARRAY, SC_CLASS_REGEX, SC_FUNCTION, SC_FLOAT, SC_INTEGER, SC_STRING, SC_SYMBOL, SC_METHOD_NAME } from "../common/protocol";

const IDENT = /[A-Za-z0-9_]/;
const SC_RECEIVER_SECTION = /(~?[A-Za-z_][A-Za-z0-9_]*|\\[A-Za-z0-9_]+|\d+(?:\.\d+)?)$/;

export interface ScMethodPrefix {
    receiver?: string,
    prefix: string,
    methodStart: number,
}

export interface ScCallContext {
    receiver?: string;
    method: string;
    /** 0-based index of the argument under the cursor */
    argIndex: number;
    methodStart: number;
}

/** splits e.g. `SinOsc.a` into receiver: `SinOsc`, prefix: `a`, methodStart: <offset> */
export function parseMethodPrefix(linePrefix: string): ScMethodPrefix | undefined {
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

function skipQuoted(text: string, i: number, quote: string): number {
    i++;
    while (i < text.length) {
        if (text[i] === '\\') { i+= 2; continue; }
        if (text[i] === quote ) { return i+1; }
        i++;
    }
    return i;
}

function skipBlockComment(text: string, i: number): number {
    i += 2;
    let depth = 1;
    while (i < text.length && depth > 0) {
        if (text[i] === '/' && text[i+1] === "*") { depth++; i+=2; continue;}
        if (text[i] === '*' && text[i+1] === "/") { depth--; i+=2; continue;}
        i++;
    }
    return i;
}



/** Scan forward for closing bracket */
export function findCallContext(text: string): ScCallContext | undefined {
    const stack: {open: number, commas: number }[] = [];
    let i = 0;

    while (i < text.length) {
        const c = text[i];

        if(c === '"' || c === '"') { i = skipQuoted(text, i, c); continue; }
        // todo: skip comment
        if(c === "/" && text[i+1] === "/") { return undefined;}
        if(c === "/" && text[i+1] === "*") { i = skipBlockComment(text, i); continue; }
        
        if(c === '(' || c === '[' || c === '{') {
            stack.push({ open: i, commas: 0});
            i++;
            continue;
        }
        if(c === ')' || c == ']' || c === '}') {
            stack.pop();
            i++;
            continue;
        }
        if(c === ',' && stack.length > 0) {
            stack[stack.length - 1].commas++;
            i++;
            continue;
        }
        i++;
    }
    
    // search for the innermost unclosed '(' that
    // has a method call in front of it
    for (let s = stack.length -1; s >= 0; s--) {
        if(text[stack[s].open] !== '(') {continue;}
        const head = parseMethodPrefix(text.slice(0, stack[s].open));
        if (head?.prefix) {
            return {
                receiver: head.receiver,
                method: head.prefix,
                argIndex: stack[s].commas,
                methodStart: head.methodStart
            };
        }
    }

    return undefined;
}
