/**
 * Structure of sclang code for the outline view and the breadcrumbs.
 *
 * Comments, strings, quoted symbols and chars get blanked, then the brackets are
 * walked and the code in front of each opening bracket decides what it belongs to:
 *
 * - class files (`.sc`): classes, class extensions and their methods
 * - code files (`.scd`): regions (a `(` in column 0) and named definitions
 *   such as `SynthDef(\name, ...)` or `Ndef(\name, ...)`
 */

export type ScSymbolKind =
    "class" | "extension" | "method" | "region" | "definition";

export interface ScSymbol {
    name: string;
    kind: ScSymbolKind;
    /** offset of the whole symbol, inclusive */
    start: number;
    /** offset of the whole symbol, exclusive */
    end: number;
    /** offset of the name, inclusive */
    nameStart: number;
    /** offset of the name, exclusive */
    nameEnd: number;
    children: ScSymbol[];
}

export interface ScOutlineOptions {
    /** `.sc` files contain class definitions on their top level */
    classFile: boolean;
}

/** `Name : Super {`, `Name[slot] {` or `+ Name {` */
const CLASS_HEAD =
    /(\+\s*)?\b([A-Z]\w*)\s*(?:\[\w*\]\s*)?(?::\s*[A-Z]\w*\s*)?$/;
/** `method {`, `*classMethod {` or a binary operator `+ {` */
const METHOD_HEAD = /(\*?([a-z]\w*)|[-+*/<>=!@%&|^?]+)\s*$/;
const DEFINITION_HEAD =
    /\b(SynthDef|Ndef|Pdef|Pdefn|Pbindef|Tdef|Fdef|OSCdef|MIDIdef)(?:\.new)?\s*$/;
const DEFINITION_NAME = /^\s*(\\\w+|'[^']*')\s*,/;
/** how far to look back for a head */
const LOOK_BEHIND = 200;
const MAX_REGION_LABEL = 40;

/** blanks comments, strings, quoted symbols and chars - offsets and line breaks are kept */
export function stripCode(text: string): string {
    return text.replace(
        /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"?|'(?:\\[\s\S]|[^'\\])*'?|\$\\?[\s\S]/g,
        (m) => m.replace(/[^\n]/g, " "),
    );
}

export function parseScOutline(
    text: string,
    options: ScOutlineOptions,
): ScSymbol[] {
    const code = stripCode(text);
    const all: ScSymbol[] = [];
    const stack: (ScSymbol | undefined)[] = [];

    for (let i = 0; i < code.length; i++) {
        const c = code[i];
        if (c === ")" || c === "]" || c === "}") {
            const sym = stack.pop();
            if (sym) {
                sym.end = i + 1;
            }
        } else if (c === "(" || c === "[" || c === "{") {
            const before = code.slice(Math.max(0, i - LOOK_BEHIND), i);
            const offset = i - before.length;
            let sym: ScSymbol | undefined;
            const add = (
                kind: ScSymbolKind,
                name: string,
                start: number,
                nameStart = start,
                nameEnd = nameStart + name.length,
            ) => {
                sym = {
                    name,
                    kind,
                    start,
                    end: code.length,
                    nameStart,
                    nameEnd,
                    children: [],
                };
                all.push(sym);
            };

            if (options.classFile && c === "{") {
                const parent = stack[stack.length - 1];
                const head =
                    stack.length === 0
                        ? CLASS_HEAD.exec(before)
                        : parent?.kind === "class" ||
                            parent?.kind === "extension"
                          ? METHOD_HEAD.exec(before)
                          : null;
                if (head && stack.length === 0) {
                    const nameStart =
                        offset + head.index + head[0].indexOf(head[2]);
                    add(
                        head[1] ? "extension" : "class",
                        head[2],
                        offset + head.index,
                        nameStart,
                    );
                } else if (head) {
                    add("method", head[1], offset + head.index);
                }
            } else if (!options.classFile && c === "(") {
                const definition = DEFINITION_HEAD.exec(before);
                const name = DEFINITION_NAME.exec(
                    text.slice(i + 1, i + 1 + LOOK_BEHIND),
                );
                if (definition && name) {
                    const symbolName = name[1].startsWith("'")
                        ? `\\${name[1].slice(1, -1)}`
                        : name[1];
                    add(
                        "definition",
                        `${definition[1]}(${symbolName})`,
                        offset + definition.index,
                        offset + definition.index,
                        i +
                            1 +
                            name.index +
                            name[0].indexOf(name[1]) +
                            name[1].length,
                    );
                } else if (
                    stack.length === 0 &&
                    (i === 0 || code[i - 1] === "\n")
                ) {
                    add("region", "", i, i, i + 1);
                }
            }
            stack.push(sym);
        }
    }

    for (const sym of all) {
        if (sym.kind === "region") {
            sym.name = regionLabel(text, sym);
        }
    }
    return nest(all);
}

/** symbols are sorted by their start and properly nested */
function nest(symbols: ScSymbol[]): ScSymbol[] {
    const roots: ScSymbol[] = [];
    const parents: ScSymbol[] = [];
    for (const sym of symbols) {
        while (parents.length && parents[parents.length - 1].end <= sym.start) {
            parents.pop();
        }
        (parents.length ? parents[parents.length - 1].children : roots).push(
            sym,
        );
        parents.push(sym);
    }
    return roots;
}

/** the comment behind the `(` or else the first line of code within the region */
function regionLabel(text: string, region: ScSymbol): string {
    const line =
        text
            .slice(region.start + 1, Math.max(region.start + 1, region.end - 1))
            .split("\n")
            .map((l) => l.replace(/^\s*\/[/*]+|\*+\/\s*$/g, "").trim())
            .find((l) => l.length > 0) ?? "";
    if (!line) {
        return "( )";
    }
    return line.length > MAX_REGION_LABEL
        ? `${line.slice(0, MAX_REGION_LABEL - 1)}…`
        : line;
}
