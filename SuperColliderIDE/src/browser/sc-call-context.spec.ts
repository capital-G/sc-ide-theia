import "mocha";
import { expect } from "chai";
import {
    parseMethodPrefix,
    guessReceiver,
    findCallContext,
} from "./sc-call-context";

describe("parseMethodPrefix", () => {
    it("extract method 'SinOsc.a'", () => {
        expect(parseMethodPrefix("SinOsc.a")).to.deep.equal({
            receiver: "SinOsc",
            prefix: "a",
            methodStart: 7,
        });
    });

    it("extract method '~buf.p'", () => {
        expect(parseMethodPrefix("~buf.p")).to.deep.equal({
            receiver: "~buf",
            prefix: "p",
            methodStart: 5,
        });
    });

    it("extract method '[1, 2].so'", () => {
        expect(parseMethodPrefix("[1, 2].so")).to.deep.equal({
            receiver: undefined,
            prefix: "so",
            methodStart: 7,
        });
    });

    it("extract method '440.cpsm'", () => {
        expect(parseMethodPrefix("440.cpsm")).to.deep.equal({
            receiver: "440",
            prefix: "cpsm",
            methodStart: 4,
        });
    });

    it("extract method 'x.play'", () => {
        expect(parseMethodPrefix("x.play")).to.deep.equal({
            receiver: "x",
            prefix: "play",
            methodStart: 2,
        });
    });

    it("extract method 'foo'", () => {
        expect(parseMethodPrefix("foo")).to.deep.equal(undefined);
    });

    it("extract SinOsc 'x = SinOsc.a'", () => {
        expect(parseMethodPrefix("x = SinOsc.a")).to.deep.equal({
            receiver: "SinOsc",
            prefix: "a",
            methodStart: 11,
        });
    });
});

describe("guessReceiver", () => {
    it("guess undefined ~foo", () => {
        expect(guessReceiver("~foo")).equal(undefined);
    });

    it("guess undefined foo", () => {
        expect(guessReceiver("foo")).equal(undefined);
    });

    it("guess symbol \\foo", () => {
        expect(guessReceiver("\\foo")).equal("Symbol");
    });

    it("guess class SinOsc", () => {
        expect(guessReceiver("SinOsc")).equal("SinOsc");
    });

    it("guess function {|a| a+2;}", () => {
        expect(guessReceiver("{|a| a+2;}")).equal("Function");
    });

    it("guess array [1, 2]", () => {
        expect(guessReceiver("[1, 2]")).equal("Array");
    });

    it("guess float 42.0", () => {
        expect(guessReceiver("42.0")).equal("Float");
    });

    it("guess integer 42", () => {
        expect(guessReceiver("42")).equal("Integer");
    });
});

describe("findCallContext", () => {
    it("simple call", () => {
        expect(findCallContext("SinOsc.kr(")).to.deep.equal({
            argIndex: 0,
            closed: false,
            cursorSegment: 0,
            implicitNew: false,
            method: "kr",
            methodStart: 7,
            open: 9,
            receiver: "SinOsc",
            segments: [
                {
                    end: 10,
                    keyword: undefined,
                    start: 10,
                    text: "",
                    value: "",
                },
            ],
        });
    });

    it("nested calls", () => {
        expect(findCallContext("SinOsc.kr(20.linexp(")).to.deep.equal({
            argIndex: 0,
            closed: false,
            cursorSegment: 0,
            implicitNew: false,
            method: "linexp",
            methodStart: 13,
            open: 19,
            receiver: "20",
            segments: [
                {
                    end: 20,
                    keyword: undefined,
                    start: 20,
                    text: "",
                    value: "",
                },
            ],
        });
    });

    it("nested calls with closed", () => {
        expect(
            findCallContext("SinOsc.kr(30.0.clip(0.2, 0.5), 20.linexp, "),
        ).to.deep.equal({
            argIndex: 2,
            closed: false,
            cursorSegment: 2,
            implicitNew: false,
            method: "kr",
            methodStart: 7,
            open: 9,
            receiver: "SinOsc",
            segments: [
                {
                    end: 29,
                    keyword: undefined,
                    start: 10,
                    text: "30.0.clip(0.2, 0.5)",
                    value: "30.0.clip(0.2, 0.5)",
                },
                {
                    end: 40,
                    keyword: undefined,
                    start: 30,
                    text: " 20.linexp",
                    value: "20.linexp",
                },
                {
                    end: 42,
                    keyword: undefined,
                    start: 41,
                    text: " ",
                    value: "",
                },
            ],
        });
    });

    it("no call", () => {
        expect(findCallContext("SinOsc.kr(30.0)")).equals(undefined);
    });

    it("skip block comment", () => {
        expect(findCallContext("SinOsc.kr(hello /* comment */")).to.deep.equal({
            argIndex: 0,
            closed: false,
            cursorSegment: 0,
            implicitNew: false,
            method: "kr",
            methodStart: 7,
            open: 9,
            receiver: "SinOsc",
            segments: [
                {
                    end: 29,
                    keyword: undefined,
                    start: 10,
                    text: "hello /* comment */",
                    value: "hello /* comment */",
                },
            ],
        });
    });

    it("skip quotes", () => {
        expect(findCallContext('SinOsc.kr(hello, "foo", ')).to.deep.equal({
            argIndex: 2,
            closed: false,
            cursorSegment: 2,
            implicitNew: false,
            method: "kr",
            methodStart: 7,
            open: 9,
            receiver: "SinOsc",
            segments: [
                {
                    end: 15,
                    keyword: undefined,
                    start: 10,
                    text: "hello",
                    value: "hello",
                },
                {
                    end: 22,
                    keyword: undefined,
                    start: 16,
                    text: ' "foo"',
                    value: '"foo"',
                },
                {
                    end: 24,
                    keyword: undefined,
                    start: 23,
                    text: " ",
                    value: "",
                },
            ],
        });
    });

    it("skip comment", () => {
        expect(findCallContext("SinOsc.kr(hello, //")).equals(undefined);
    });

    it("test implicit new", () => {
        expect(findCallContext("Pwhite(")).to.deep.equal({
            argIndex: 0,
            closed: false,
            cursorSegment: 0,
            implicitNew: true,
            method: "new",
            methodStart: 0,
            open: 6,
            receiver: "Pwhite",
            segments: [
                {
                    end: 7,
                    keyword: undefined,
                    start: 7,
                    text: "",
                    value: "",
                },
            ],
        });
    });

    it("test non implicit new", () => {
        expect(findCallContext("Pwhite.new(")).to.deep.equal({
            argIndex: 0,
            closed: false,
            cursorSegment: 0,
            implicitNew: false,
            method: "new",
            methodStart: 7,
            open: 10,
            receiver: "Pwhite",
            segments: [
                {
                    end: 11,
                    keyword: undefined,
                    start: 11,
                    text: "",
                    value: "",
                },
            ],
        });
    });

    it("test no head", () => {
        expect(findCallContext("x = (foo + bar")).equals(undefined);
    });

    it("test keyword matching", () => {
        expect(findCallContext("SinOsc.ar(freq: 440,")).to.deep.equals({
            argIndex: 1,
            closed: false,
            cursorSegment: 1,
            implicitNew: false,
            method: "ar",
            methodStart: 7,
            open: 9,
            receiver: "SinOsc",
            segments: [
                {
                    end: 19,
                    keyword: "freq",
                    start: 10,
                    text: "freq: 440",
                    value: "440",
                },
                {
                    end: 20,
                    keyword: undefined,
                    start: 20,
                    text: "",
                    value: "",
                },
            ],
        });
    });

    it("test cursor in kwarg", () => {
        expect(
            findCallContext(
                "SinOsc.ar(mul: , add: 0.5)",
                "SinOsc.ar(mul: ".length,
            )?.segments[1].keyword,
        ).equals("add");
    });

    it("test cursor in call", () => {
        expect(findCallContext("SinOsc.ar(420)", 13)?.cursorSegment).equals(0);
    });

    it("test cursor outside call", () => {
        expect(findCallContext("SinOsc.ar(420)", 15)).equals(undefined);
    });
});
