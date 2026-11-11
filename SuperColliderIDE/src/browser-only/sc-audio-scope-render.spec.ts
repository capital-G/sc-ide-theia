import "mocha";
import { expect } from "chai";
import {
    hasInvalidBins,
    isSilentSpectrum,
    measure,
    meterReadout,
} from "./sc-audio-scope-render";

describe("audio scope analysis", () => {
    it("treats silence as valid, NaN and +Infinity as poisoned", () => {
        expect(
            hasInvalidBins(new Float32Array([-Infinity, -100, -3])),
        ).to.equal(false);
        expect(hasInvalidBins(new Float32Array([-12, NaN, -3]))).to.equal(true);
        expect(hasInvalidBins(new Float32Array([-12, Infinity]))).to.equal(
            true,
        );
    });

    it("measures without non-finite samples", () => {
        const { peak, rms } = measure(
            new Float32Array([0.5, NaN, -0.5, Infinity]),
        );
        expect(peak).to.equal(0.5);
        expect(rms).to.equal(0.5);
        expect(measure(new Float32Array([NaN]))).to.deep.equal({
            peak: 0,
            rms: 0,
        });
    });

    it("shows levels below the floor of the meter as -inf", () => {
        expect(meterReadout(1)).to.equal("0.0");
        expect(meterReadout(0.5)).to.equal("-6.0");
        expect(meterReadout(Math.pow(10, -89 / 20))).to.equal("-89.0");
        expect(meterReadout(Math.pow(10, -200 / 20))).to.equal("-inf");
        expect(meterReadout(0)).to.equal("-inf");
    });

    it("detects an entirely silent spectrum", () => {
        expect(
            isSilentSpectrum(new Float32Array([-Infinity, -Infinity])),
        ).to.equal(true);
        expect(isSilentSpectrum(new Float32Array([-Infinity, -140]))).to.equal(
            false,
        );
        expect(isSilentSpectrum(new Float32Array([]))).to.equal(false);
    });
});
