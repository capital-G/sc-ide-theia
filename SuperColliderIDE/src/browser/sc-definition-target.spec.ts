import "mocha";
import { expect } from "chai";
import { sourcePosition, symbolTarget } from "./sc-definition-target";
import { decodeLocationRows } from "../common/sc-service-core";

describe("symbolTarget", () => {
    it("class 'SinOsc' in 'SinOsc.ar'", () => {
        expect(symbolTarget("{ SinOsc", "SinOsc")).to.deep.equal({
            kind: "class",
            name: "SinOsc",
        });
    });

    it("method 'ar' w/ receiver 'SinOsc'", () => {
        expect(symbolTarget("{ SinOsc.ar", "ar")).to.deep.equal({
            kind: "method",
            name: "ar",
            receiver: "SinOsc",
        });
    });

    it("method w/ env receiver", () => {
        expect(symbolTarget("~buf.play", "play")).to.deep.equal({
            kind: "method",
            name: "play",
            receiver: "~buf",
        });
    });

    it("bare method name", () => {
        expect(symbolTarget("x = midicps", "midicps")).to.deep.equal({
            kind: "method",
            name: "midicps",
        });
    });

    it("ignores symbol literals", () => {
        expect(symbolTarget("Pbind(\\freq", "freq")).to.be.undefined;
    });

    it("ignores mismatching words", () => {
        expect(symbolTarget("SinOsc.ar", "SinOsc")).to.be.undefined;
    });
});

describe("sourcePosition", () => {
    const enc = (s: string) => new TextEncoder().encode(s);

    it("class charPos points at the name", () => {
        const src = "// x\nSinOsc : PureUGen {\n";
        expect(sourcePosition(enc(src), 5)).to.deep.equal({
            lineNumber: 2,
            column: 1,
            length: 6,
        });
    });

    it("skips indentation and '*' of class methods", () => {
        const src = "SinOsc : PureUGen {\n\t*ar {\n";
        expect(sourcePosition(enc(src), 19)).to.deep.equal({
            lineNumber: 2,
            column: 3,
            length: 2,
        });
    });

    it("operator methods", () => {
        const src = "A {\n\t+ { arg b; }\n";
        expect(sourcePosition(enc(src), 4)).to.deep.equal({
            lineNumber: 2,
            column: 2,
            length: 1,
        });
    });

    it("converts byte offsets w/ multibyte chars to utf-16 columns", () => {
        // 'ö' is 2 bytes in utf-8, but a single utf-16 code unit
        const src = "// ö\n/* ö */ Foo {\n";
        const charPos = enc("// ö\n/* ö */ ").length;
        expect(sourcePosition(enc(src), charPos)).to.deep.equal({
            lineNumber: 2,
            column: 9,
            length: 3,
        });
    });

    it("out of range", () => {
        expect(sourcePosition(enc("abc"), 10)).to.be.undefined;
    });
});

describe("decodeLocationRows", () => {
    it("decodes rows and drops malformed ones", () => {
        expect(
            decodeLocationRows([
                "/sc/Osc.sc\t479",
                "/My Folder/a\tb.sc\t12",
                "/no/pos.sc\t",
                "/neg.sc\t-1",
                "nopath",
                "\t5",
            ]),
        ).to.deep.equal([
            { path: "/sc/Osc.sc", charPos: 479 },
            { path: "/My Folder/a\tb.sc", charPos: 12 },
        ]);
    });

    it("handles missing replies", () => {
        expect(decodeLocationRows(undefined)).to.deep.equal([]);
    });
});
