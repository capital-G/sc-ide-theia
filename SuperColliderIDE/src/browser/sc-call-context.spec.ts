import 'mocha';
import { expect } from 'chai';
import { parseMethodPrefix, guessReceiver } from './sc-call-context';


describe('parseMethodPrefix', () => {
    it("extract method 'SinOsc.a'", () => {
        expect(parseMethodPrefix("SinOsc.a")).to.deep.equal({
            receiver: 'SinOsc',
            prefix: 'a',
            methodStart: 7,
        })
    });

    it("extract method '~buf.p'", () => {
        expect(parseMethodPrefix("~buf.p")).to.deep.equal({
            receiver: '~buf',
            prefix: 'p',
            methodStart: 5,
        })
    });

    it("extract method '[1, 2].so'", () => {
        expect(parseMethodPrefix("[1, 2].so")).to.deep.equal({
            receiver: undefined,
            prefix: 'so',
            methodStart: 7,
        })
    });

    it("extract method '440.cpsm'", () => {
        expect(parseMethodPrefix("440.cpsm")).to.deep.equal({
            receiver: '440',
            prefix: 'cpsm',
            methodStart: 4,
        })
    });

    it("extract method 'x.play'", () => {
        expect(parseMethodPrefix("x.play")).to.deep.equal({
            receiver: 'x',
            prefix: 'play',
            methodStart: 2,
        })
    });

    it("extract method 'foo'", () => {
        expect(parseMethodPrefix("foo")).to.deep.equal(undefined)
    });

    it("extract SinOsc 'x = SinOsc.a'", () => {
        expect(parseMethodPrefix("x = SinOsc.a")).to.deep.equal({
            receiver: "SinOsc",
            prefix: "a",
            methodStart: 11,
        })
    })

});

describe('guessReceiver', () => {
    it("guess undefined ~foo", () => {
        expect(guessReceiver("~foo")).equal(undefined)
    });

    it("guess undefined foo", () => {
        expect(guessReceiver("foo")).equal(undefined)
    });

    it("guess symbol \\foo", () => {
        expect(guessReceiver("\\foo")).equal("Symbol")
    });

    it("guess class SinOsc", () => {
        expect(guessReceiver("SinOsc")).equal("SinOsc")
    });

    it("guess function {|a| a+2;}", () => {
        expect(guessReceiver("{|a| a+2;}")).equal("Function")
    });

    it("guess array [1, 2]", () => {
        expect(guessReceiver("[1, 2]")).equal("Array")
    });

    it("guess float 42.0", () => {
        expect(guessReceiver("42.0")).equal("Float")
    });

    it("guess integer 42", () => {
        expect(guessReceiver("42")).equal("Integer")
    });
});
