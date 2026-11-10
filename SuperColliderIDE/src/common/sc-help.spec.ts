import "mocha";
import { expect } from "chai";
import {
    ScHelpBackend,
    ScHelpTarget,
    decodeHelpTarget,
    helpRequestPath,
    helpTargetUrl,
    resolveHelpRequest,
} from "./sc-help";
import { scStringLiteral } from "./sc-service-core";

describe("helpRequestPath", () => {
    it("decodes paths below the route", () => {
        expect(helpRequestPath("/sc-help/Classes/SinOsc.html")).to.equal(
            "Classes/SinOsc.html",
        );
        expect(helpRequestPath("/sc-help/Guides/A%20B.html")).to.equal(
            "Guides/A B.html",
        );
    });

    it("defaults to the help home", () => {
        expect(helpRequestPath("/sc-help/")).to.equal("Help.html");
    });

    it("rejects escaping the help dir", () => {
        expect(helpRequestPath("/sc-help/../secret")).to.be.undefined;
        expect(helpRequestPath("/sc-help/a/%2e%2e/%2e%2e/b")).to.be.undefined;
        expect(helpRequestPath("/sc-help/%2Fetc/passwd")).to.be.undefined;
        expect(helpRequestPath("/sc-help/a%5C..%5Cb")).to.be.undefined;
        expect(helpRequestPath("/sc-help/a%0Ab")).to.be.undefined;
        expect(helpRequestPath("/sc-help/%E0%A4%A")).to.be.undefined;
        expect(helpRequestPath("/other/x.html")).to.be.undefined;
    });
});

describe("helpTargetUrl", () => {
    it("adds fragment and query", () => {
        expect(
            helpTargetUrl({
                kind: "local",
                path: "Classes/SinOsc.html",
                fragment: "*ar",
            }),
        ).to.equal("/sc-help/Classes/SinOsc.html#*ar");
        expect(
            helpTargetUrl({
                kind: "local",
                path: "BrokenLink.html",
                fragment: "Classes/Foo.html",
            }),
        ).to.equal("/sc-help/BrokenLink.html#Classes/Foo.html");
    });

    it("encodes path segments", () => {
        expect(
            helpTargetUrl({ kind: "local", path: "Guides/A B.html" }),
        ).to.equal("/sc-help/Guides/A%20B.html");
    });

    it("passes remote urls", () => {
        expect(
            helpTargetUrl({
                kind: "remote",
                url: "https://supercollider.github.io",
            }),
        ).to.equal("https://supercollider.github.io");
    });
});

describe("decodeHelpTarget", () => {
    it("decodes local and remote rows", () => {
        expect(
            decodeHelpTarget(["local", "Classes/SinOsc.html", "*ar", ""]),
        ).to.deep.equal({
            kind: "local",
            path: "Classes/SinOsc.html",
            fragment: "*ar",
            query: undefined,
        });
        expect(decodeHelpTarget(["remote", "https://x.org"])).to.deep.equal({
            kind: "remote",
            url: "https://x.org",
        });
    });

    it("handles empty replies", () => {
        expect(decodeHelpTarget(undefined)).to.be.undefined;
        expect(decodeHelpTarget([])).to.be.undefined;
        expect(decodeHelpTarget(["local"])).to.be.undefined;
    });
});

describe("resolveHelpRequest", () => {
    const backend = (
        prepared: Record<string, ScHelpTarget | undefined>,
        files: string[] = [],
    ): ScHelpBackend & { prepared: string[] } => {
        const calls: string[] = [];
        return {
            prepared: calls,
            prepareHelp: async (path) => {
                calls.push(path);
                return prepared[path];
            },
            exists: async (path) => files.includes(path),
        };
    };

    it("serves a prepared page", async () => {
        const b = backend({
            "Classes/SinOsc.html": {
                kind: "local",
                path: "Classes/SinOsc.html",
            },
        });
        expect(
            await resolveHelpRequest(b, "/sc-help/Classes/SinOsc.html"),
        ).to.deep.equal({
            kind: "file",
            path: "Classes/SinOsc.html",
            contentType: "text/html; charset=utf-8",
        });
        expect(b.prepared).to.deep.equal(["Classes/SinOsc.html"]);
    });

    it("redirects broken links", async () => {
        const b = backend({
            "Classes/Nope.html": {
                kind: "local",
                path: "BrokenLink.html",
                fragment: "Classes/Nope.html",
            },
        });
        expect(
            await resolveHelpRequest(b, "/sc-help/Classes/Nope.html"),
        ).to.deep.equal({
            kind: "redirect",
            location: "/sc-help/BrokenLink.html#Classes/Nope.html",
        });
    });

    it("asks to retry if sclang is not available", async () => {
        const res = await resolveHelpRequest(backend({}), "/sc-help/Help.html");
        expect(res.kind).to.equal("error");
        expect(res.kind === "error" && res.status).to.equal(503);
        expect(res.kind === "error" && res.html).to.contain(
            'http-equiv="refresh"',
        );
    });

    it("serves static files w/o preparing them", async () => {
        const b = backend({}, ["static/scdoc.css"]);
        expect(
            await resolveHelpRequest(b, "/sc-help/static/scdoc.css"),
        ).to.deep.equal({
            kind: "file",
            path: "static/scdoc.css",
            contentType: "text/css; charset=utf-8",
        });
        expect(b.prepared).to.be.empty;
        const missing = await resolveHelpRequest(b, "/sc-help/frontend.js");
        expect(missing.kind === "error" && missing.status).to.equal(404);
    });

    it("rejects invalid paths", async () => {
        const res = await resolveHelpRequest(backend({}), "/sc-help/../x.html");
        expect(res.kind === "error" && res.status).to.equal(400);
    });
});

describe("scStringLiteral", () => {
    it("quotes and escapes", () => {
        expect(scStringLiteral("Classes/SinOsc.html")).to.equal(
            '"Classes/SinOsc.html"',
        );
        expect(scStringLiteral('a"b')).to.equal('"a\\"b"');
        expect(scStringLiteral("a\\")).to.equal('"a\\\\"');
        expect(scStringLiteral('\\"); 0.exit; ("')).to.equal(
            '"\\\\\\"); 0.exit; (\\""',
        );
    });

    it("rejects control chars", () => {
        expect(scStringLiteral("a\nb")).to.be.undefined;
        expect(scStringLiteral("a\x1bb")).to.be.undefined;
    });
});
