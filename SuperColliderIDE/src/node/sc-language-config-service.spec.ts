import "mocha";
import { expect } from "chai";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import * as path from "path";
import {
    ScLanguageConfigServiceImpl,
    parseLanguageConfig,
    updateLanguageConfig,
} from "./sc-language-config-service";
import {
    defaultScsynth,
    installationOf,
    resolveSclang,
    sclangOfInstallation,
    scsynthProgramCode,
    userConfigDir,
} from "./sc-executables";
import { DEFAULT_LANGUAGE_CONFIG } from "../common/sc-language-config";

const QT_CONFIG = `# my config
includePaths:
    - /Users/me/quarks/foo
excludePaths:
    []
postInlineWarnings: true
excludeDefaultPaths: false
customKey: 42
`;

describe("language config yaml", () => {
    it("reads the keys sclang knows", () => {
        expect(parseLanguageConfig(QT_CONFIG)).to.deep.equal({
            includePaths: ["/Users/me/quarks/foo"],
            excludePaths: [],
            postInlineWarnings: true,
            excludeDefaultPaths: false,
        });
    });

    it("falls back to the defaults for empty or invalid files", () => {
        expect(parseLanguageConfig("")).to.deep.equal(DEFAULT_LANGUAGE_CONFIG);
        expect(parseLanguageConfig("- just a list")).to.deep.equal(
            DEFAULT_LANGUAGE_CONFIG,
        );
        expect(
            parseLanguageConfig("includePaths: nope\npostInlineWarnings: 1"),
        ).to.deep.equal(DEFAULT_LANGUAGE_CONFIG);
    });

    it("keeps comments and unknown keys on update", () => {
        const updated = updateLanguageConfig(QT_CONFIG, {
            includePaths: ["/a", "/b"],
            excludePaths: ["/c"],
            postInlineWarnings: false,
            excludeDefaultPaths: true,
        });
        expect(updated).to.contain("# my config");
        expect(updated).to.contain("customKey: 42");
        expect(parseLanguageConfig(updated)).to.deep.equal({
            includePaths: ["/a", "/b"],
            excludePaths: ["/c"],
            postInlineWarnings: false,
            excludeDefaultPaths: true,
        });
    });

    it("writes a new file", () => {
        const config = { ...DEFAULT_LANGUAGE_CONFIG, includePaths: ["/x y"] };
        expect(
            parseLanguageConfig(updateLanguageConfig("", config)),
        ).to.deep.equal(config);
    });
});

describe("ScLanguageConfigServiceImpl", () => {
    let dir: string;
    let service: ScLanguageConfigServiceImpl;

    class TestService extends ScLanguageConfigServiceImpl {
        constructor(configHome: string) {
            super();
            this.environment = {
                platform: "linux",
                env: { XDG_CONFIG_HOME: configHome },
                home: "/nonexistent",
            };
        }
    }

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), "sc-config-"));
        service = new TestService(dir);
    });

    afterEach(() => rm(dir, { recursive: true, force: true }));

    const configDir = () => path.join(dir, "SuperCollider");

    it("lists the config files of the config dir", async () => {
        const empty = await service.getInfo();
        expect(empty.configDir).to.equal(configDir());
        expect(empty.defaultConfigFile).to.equal(
            path.join(configDir(), "sclang_conf.yaml"),
        );
        expect(empty.configFiles).to.deep.equal([]);

        await service.create("live", DEFAULT_LANGUAGE_CONFIG);
        await writeFile(path.join(configDir(), "other.yaml"), "");
        expect((await service.getInfo()).configFiles).to.deep.equal([
            path.join(configDir(), "sclang_conf_live.yaml"),
        ]);
    });

    it("reads the defaults of a missing file and writes it", async () => {
        const file = path.join(configDir(), "sclang_conf.yaml");
        expect(await service.read(file)).to.deep.equal(DEFAULT_LANGUAGE_CONFIG);
        const config = { ...DEFAULT_LANGUAGE_CONFIG, postInlineWarnings: true };
        await service.write(file, config);
        expect(await service.read(file)).to.deep.equal(config);
    });

    it("keeps comments of an existing file", async () => {
        const file = path.join(dir, "sclang_conf.yaml");
        await writeFile(file, QT_CONFIG);
        await service.write(file, DEFAULT_LANGUAGE_CONFIG);
        expect(await readFile(file, "utf8")).to.contain("# my config");
    });

    it("validates the names of new files", async () => {
        for (const name of ["", "a b", "../x", "x.yaml"]) {
            await expectRejection(
                service.create(name, DEFAULT_LANGUAGE_CONFIG),
            );
        }
        await service.create("ok_1-2", DEFAULT_LANGUAGE_CONFIG);
        await expectRejection(
            service.create("ok_1-2", DEFAULT_LANGUAGE_CONFIG),
        );
    });

    it("only deletes config files of the config dir", async () => {
        const file = await service.create("live", DEFAULT_LANGUAGE_CONFIG);
        const outside = path.join(dir, "sclang_conf.yaml");
        await writeFile(outside, "");
        const other = path.join(configDir(), "startup.scd");
        await writeFile(other, "");

        await expectRejection(service.delete(outside));
        await expectRejection(service.delete(other));
        await expectRejection(
            service.delete(path.join(configDir(), "..", "sclang_conf.yaml")),
        );
        await service.delete(file);
        expect((await service.getInfo()).configFiles).to.deep.equal([]);
    });
});

describe("sc executables", () => {
    it("finds the user config dir", () => {
        expect(
            userConfigDir({ platform: "darwin", env: {}, home: "/Users/me" }),
        ).to.equal("/Users/me/Library/Application Support/SuperCollider");
        expect(
            userConfigDir({ platform: "linux", env: {}, home: "/home/me" }),
        ).to.equal("/home/me/.config/SuperCollider");
        expect(
            userConfigDir({
                platform: "linux",
                env: { XDG_CONFIG_HOME: "/cfg" },
                home: "/home/me",
            }),
        ).to.equal("/cfg/SuperCollider");
        expect(
            userConfigDir({
                platform: "win32",
                env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
                home: "C:\\Users\\me",
            }),
        ).to.equal("C:\\Users\\me\\AppData\\Local\\SuperCollider");
    });

    it("derives scsynth from sclang", () => {
        expect(
            defaultScsynth(
                "/Applications/SuperCollider.app/Contents/MacOS/sclang",
                "darwin",
            ),
        ).to.equal(
            "/Applications/SuperCollider.app/Contents/Resources/scsynth",
        );
        expect(defaultScsynth("/usr/bin/sclang", "linux")).to.equal(
            "/usr/bin/scsynth",
        );
        expect(
            defaultScsynth(
                "C:\\Program Files\\SuperCollider\\sclang.exe",
                "win32",
            ),
        ).to.equal("C:\\Program Files\\SuperCollider\\scsynth.exe");
    });

    it("maps an installation to its sclang and back", () => {
        const app = "/Applications/SuperCollider.app";
        const sclang = `${app}/Contents/MacOS/sclang`;
        expect(sclangOfInstallation(app, "darwin")).to.equal(sclang);
        expect(sclangOfInstallation(`${app}/`, "darwin")).to.equal(sclang);
        expect(installationOf(sclang, "darwin")).to.equal(app);
        // e.g. a build folder on macOS
        expect(sclangOfInstallation("/build/bin", "darwin")).to.equal(
            "/build/bin/sclang",
        );
        expect(installationOf("/build/bin/sclang", "darwin")).to.equal(
            "/build/bin",
        );
        expect(sclangOfInstallation("/usr/local/bin", "linux")).to.equal(
            "/usr/local/bin/sclang",
        );
        expect(
            sclangOfInstallation("C:\\Program Files\\SuperCollider", "win32"),
        ).to.equal("C:\\Program Files\\SuperCollider\\sclang.exe");
        expect(
            installationOf(
                "C:\\Program Files\\SuperCollider\\sclang.exe",
                "win32",
            ),
        ).to.equal("C:\\Program Files\\SuperCollider");
    });

    it("prefers an explicit sclang over the installation and the env", async () => {
        const environment = {
            platform: "darwin" as const,
            env: { SC_LANG_PATH: "/env/sclang" },
            home: "/nonexistent",
        };
        expect(await resolveSclang(environment)).to.equal("/env/sclang");
        expect(
            await resolveSclang(environment, { installation: "/x/SC.app" }),
        ).to.equal("/x/SC.app/Contents/MacOS/sclang");
        expect(
            await resolveSclang(environment, {
                installation: "/x/SC.app",
                sclangPath: "/dev/sclang",
            }),
        ).to.equal("/dev/sclang");
    });

    it("escapes the scsynth path for sclang", () => {
        expect(scsynthProgramCode('/opt/my "sc"/scsynth', "darwin")).to.equal(
            'Server.program = "exec " ++ "/opt/my \\"sc\\"/scsynth".shellQuote; Score.program = Server.program;',
        );
        expect(scsynthProgramCode("C:\\sc\\scsynth.exe", "win32")).to.equal(
            'Server.program = "C:\\\\sc\\\\scsynth.exe".quote; Score.program = Server.program;',
        );
    });
});

async function expectRejection(promise: Promise<unknown>): Promise<void> {
    try {
        await promise;
    } catch {
        return;
    }
    throw new Error("expected a rejection");
}
