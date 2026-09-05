import "mocha";
import { expect } from "chai";
import { evalRangeAt, EvalRange } from "./eval-region";

/**
 * Helper function wrapper - use `|` to indicate where the cursor was placed for evaluation
 */
function evalAt(marked: string): { text: string; kind: EvalRange["kind"] } {
    const offset = marked.indexOf("|");
    const text = marked.replace("|", "");
    const range = evalRangeAt(text, offset);
    return {
        text: text.slice(range.start, range.end),
        kind: range.kind,
    };
}

describe("evalRangeAt", () => {
    it("eval block", () => {
        expect(evalAt("(\n1+|1;\n)")).to.deep.equal({
            text: "\n1+1;\n",
            kind: "region",
        });
    });

    it("eval line when no block", () => {
        expect(evalAt("x=1;\ny=|2;\nz=3;\n")).to.deep.equal({
            text: "y=2;",
            kind: "line",
        });
    });

    it("eval block when cursor at end", () => {
        expect(evalAt("(\nx=1;\ny=1;\n)|")).to.deep.equal({
            text: "\nx=1;\ny=1;\n",
            kind: "region",
        });
    });

    it("eval skip first section when cursor at end", () => {
        expect(evalAt("(\nx=1;\ny=1;\n)\n\n(\nx=2;\n)|")).to.deep.equal({
            text: "\nx=2;\n",
            kind: "region",
        });
    });
});
