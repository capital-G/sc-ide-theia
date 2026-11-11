import "mocha";
import { expect } from "chai";
import { parseScOutline, ScSymbol } from "./sc-outline-parser";

interface Tree {
    name: string;
    kind: ScSymbol["kind"];
    children?: Tree[];
}

function tree(symbols: ScSymbol[]): Tree[] {
    return symbols.map((s) =>
        s.children.length
            ? { name: s.name, kind: s.kind, children: tree(s.children) }
            : { name: s.name, kind: s.kind },
    );
}

const scd = (text: string) => parseScOutline(text, { classFile: false });
const sc = (text: string) => parseScOutline(text, { classFile: true });

describe("parseScOutline", () => {
    describe("class files", () => {
        it("classes, extensions and their methods", () => {
            const text = [
                "Foo : Bar {",
                "\tvar <>freq;",
                "\t*new { |freq| ^super.new.init(freq) }",
                "\tinit { |f| freq = f; { 1 }.value }",
                "\t+ { |other| ^freq + other }",
                "}",
                "+ Object {",
                "\tfoo {}",
                "}",
                "Baz[slot] {}",
            ].join("\n");
            const symbols = sc(text);
            expect(tree(symbols)).to.deep.equal([
                {
                    name: "Foo",
                    kind: "class",
                    children: [
                        { name: "*new", kind: "method" },
                        { name: "init", kind: "method" },
                        { name: "+", kind: "method" },
                    ],
                },
                {
                    name: "Object",
                    kind: "extension",
                    children: [{ name: "foo", kind: "method" }],
                },
                { name: "Baz", kind: "class" },
            ]);
            const [foo, object] = symbols;
            expect(text.slice(foo.start, foo.end)).to.match(
                /^Foo : Bar \{[\s\S]*\}$/,
            );
            expect(text.slice(object.nameStart, object.nameEnd)).to.equal(
                "Object",
            );
        });

        it("ignores brackets in strings, symbols, chars and comments", () => {
            const text = [
                "Foo {",
                '\ta { ^"}" }',
                "\tb { ^'}' }",
                "\tc { ^$} }",
                "\t/* } */",
                "\t// }",
                "\td { ^$\\\\ }",
                "}",
            ].join("\n");
            expect(
                tree(sc(text))[0].children!.map((c) => c.name),
            ).to.deep.equal(["a", "b", "c", "d"]);
        });
    });

    describe("code files", () => {
        it("regions named by their comment or first line", () => {
            const text = [
                "( // boot",
                "s.boot;",
                ")",
                "",
                "(",
                "x = { SinOsc.ar }.play;",
                ")",
                "  (1 + 2)",
                "Routine { 1.wait }.play;",
            ].join("\n");
            expect(tree(scd(text))).to.deep.equal([
                { name: "boot", kind: "region" },
                { name: "x = { SinOsc.ar }.play;", kind: "region" },
            ]);
        });

        it("named definitions", () => {
            const text = [
                "(",
                "SynthDef(\\sine, { |freq| Out.ar(0, SinOsc.ar(freq)) }).add;",
                "s.waitForBoot { Ndef('drone', { Saw.ar }) };",
                "Pdef(\\seq).play;",
                ")",
            ].join("\n");
            const [region] = scd(text);
            expect(tree(region.children)).to.deep.equal([
                { name: "SynthDef(\\sine)", kind: "definition" },
                { name: "Ndef(\\drone)", kind: "definition" },
            ]);
            const synthDef = region.children[0];
            expect(text.slice(synthDef.nameStart, synthDef.nameEnd)).to.equal(
                "SynthDef(\\sine",
            );
        });

        it("unterminated code ends with the document", () => {
            const text = "(\nSynthDef(\\a, {";
            const [region] = scd(text);
            expect(region.end).to.equal(text.length);
            expect(region.children[0].end).to.equal(text.length);
        });
    });
});
