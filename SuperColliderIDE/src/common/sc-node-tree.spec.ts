import "mocha";
import { expect } from "chai";
import OSC from "osc-js";
import {
    parseQueryTreeReply,
    queryTreeMessage,
    setControlMessage,
} from "./sc-node-tree";

function unpack(bytes: Uint8Array): OSC.Message {
    const msg = new OSC.Message("");
    msg.unpack(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return msg;
}

describe("parseQueryTreeReply", () => {
    it("an empty server", () => {
        // root group 0 w/ the default group 1
        expect(parseQueryTreeReply([0, 0, 1, 1, 0])).to.deep.equal({
            kind: "group",
            id: 0,
            children: [{ kind: "group", id: 1, children: [] }],
        });
    });

    it("nested groups and synths w/o controls", () => {
        const args = [
            0,
            0,
            2,
            1,
            2,
            1000,
            -1,
            "sine",
            2,
            1,
            1001,
            -1,
            "fx",
            1002,
            -1,
            "out",
        ];
        expect(parseQueryTreeReply(args)).to.deep.equal({
            kind: "group",
            id: 0,
            children: [
                {
                    kind: "group",
                    id: 1,
                    children: [
                        {
                            kind: "synth",
                            id: 1000,
                            defName: "sine",
                            controls: [],
                        },
                        {
                            kind: "group",
                            id: 2,
                            children: [
                                {
                                    kind: "synth",
                                    id: 1001,
                                    defName: "fx",
                                    controls: [],
                                },
                            ],
                        },
                    ],
                },
                { kind: "synth", id: 1002, defName: "out", controls: [] },
            ],
        });
    });

    it("controls w/ values, bus mappings and indices", () => {
        const args = [
            1,
            0,
            1,
            1000,
            -1,
            "sine",
            3,
            "freq",
            440.5,
            "amp",
            "c3",
            2,
            "a12",
        ];
        expect(parseQueryTreeReply(args)).to.deep.equal({
            kind: "group",
            id: 0,
            children: [
                {
                    kind: "synth",
                    id: 1000,
                    defName: "sine",
                    controls: [
                        { name: "freq", value: 440.5 },
                        { name: "amp", value: "c3" },
                        { name: "2", value: "a12" },
                    ],
                },
            ],
        });
    });

    it("rejects malformed and truncated replies", () => {
        expect(parseQueryTreeReply([])).to.equal(undefined);
        expect(parseQueryTreeReply([0, 0, 2, 1, 0])).to.equal(undefined);
        expect(
            parseQueryTreeReply([1, 0, 1, 1000, -1, "sine", 2, "freq"]),
        ).to.equal(undefined);
        expect(parseQueryTreeReply([0, "x", 0])).to.equal(undefined);
        // a synth can not be queried as the root
        expect(parseQueryTreeReply([0, 1000, -1, "sine"])).to.equal(undefined);
    });
});

describe("node tree messages", () => {
    it("queries the tree w/ controls", () => {
        const msg = unpack(queryTreeMessage(true));
        expect(msg.address).to.equal("/g_queryTree");
        expect(msg.args).to.deep.equal([0, 1]);
    });

    it("sets controls by name or index", () => {
        expect(
            unpack(setControlMessage(1000, "freq", 440.5)).args,
        ).to.deep.equal([1000, "freq", 440.5]);
        expect(unpack(setControlMessage(1000, "3", 1)).args).to.deep.equal([
            1000, 3, 1,
        ]);
    });
});
