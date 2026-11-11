import {
    PreferenceContribution,
    PreferenceSchemaService,
    URI,
} from "@theia/core";
import { BinaryBuffer } from "@theia/core/lib/common/buffer";
import { inject, injectable } from "@theia/core/shared/inversify";
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { BrowserOnlyWorkspaceServer } from "@theia/workspace/lib/browser-only/browser-only-workspace-server";
import { FileService } from "@theia/filesystem/lib/browser/file-service";
import { ScScratchPad } from "../browser/sc-default-language";

/**
 * Folder in the origin private file system (OPFS) of the browser. It must not
 * overlap with `sclang:/sc/...`, as the collaboration maps files by their path.
 */
export const SC_DEFAULT_WORKSPACE = new URI("file:///workspace");
export const SC_SCRATCH_FILE = SC_DEFAULT_WORKSPACE.resolve("scratch.scd");

const SCRATCH_CONTENT = `// welcome to sc.wasm
// use cmd/ctrl+enter to evaluate the current line or the (region) around the cursor,
// cmd+. stops all sounds

// use cmd/ctrl+shift+p or f1 to trigger the command palette to spawn e.g. an oscilloscope or change the theme

s.options.numInputBusChannels = 0;
s.boot;

(
Ndef(\\x, {
	var sig = SinOscFB.ar([LFSaw.ar(0.01).exprange(200, 400), 1.0]*2, SinOscFB.ar(0.3, 1.3).range(0.0, 1.8));
	4.do({|i|
		var shift = Select.kr(ToggleFF.kr(Impulse.kr(i)), [0.5, 4.0]);
		sig = PitchShift.ar(sig, i.linexp(0, 4, 0.02, 0.2), shift);
		sig = SelectX.ar(SinOscFB.kr(i.reciprocal*4, i.reciprocal).unipolar, sig).dup;
	});
	sig = (sig / Amplitude.kr(sig, 0.01, 0.01)).tanh * 0.5;
	LeakDC.ar(sig);
}).play;
)

`;

/**
 * Opens a default workspace in the browser storage on the first visit, so code
 * gets persisted and a collaboration session can be started right away.
 */
@injectable()
export class ScBrowserOnlyWorkspaceServer extends BrowserOnlyWorkspaceServer {
    override async getMostRecentlyUsedWorkspace(): Promise<string | undefined> {
        const recent = await super.getMostRecentlyUsedWorkspace();
        if (recent) {
            return recent;
        }
        try {
            await this.ensureDefaultWorkspace();
            return SC_DEFAULT_WORKSPACE.toString();
        } catch (e) {
            // e.g. no OPFS in a private window of firefox
            this.logger.warn("Could not create the default workspace", e);
            return undefined;
        }
    }

    /** creates the folder and the scratch pad, unless the folder exists */
    protected async ensureDefaultWorkspace(): Promise<void> {
        if (await this.fileService.exists(SC_DEFAULT_WORKSPACE)) {
            return;
        }
        await this.fileService.createFolder(SC_DEFAULT_WORKSPACE);
        await this.fileService.createFile(
            SC_SCRATCH_FILE,
            BinaryBuffer.fromString(SCRATCH_CONTENT),
        );
    }
}

/** the scratch pad of the default workspace instead of an untitled document */
@injectable()
export class ScWorkspaceScratchPad implements ScScratchPad {
    @inject(WorkspaceService)
    protected readonly workspaceService!: WorkspaceService;
    @inject(FileService) protected readonly fileService!: FileService;

    async uri(): Promise<URI | undefined> {
        const roots = await this.workspaceService.roots;
        // e.g. not within a collaboration session, which has its own workspace
        const inDefault = roots.some((root) =>
            root.resource.isEqual(SC_DEFAULT_WORKSPACE),
        );
        if (inDefault && (await this.fileService.exists(SC_SCRATCH_FILE))) {
            return SC_SCRATCH_FILE;
        }
        return undefined;
    }
}

/**
 * Workspace trust guards tasks, terminals and plugins, which the wasm build does
 * not have - sclang and scsynth run within the sandbox of the browser anyways.
 * Its prompt would only distract on the first visit of the default workspace.
 */
@injectable()
export class ScBrowserOnlyPreferences implements PreferenceContribution {
    async initSchema(service: PreferenceSchemaService): Promise<void> {
        service.registerOverride(
            "security.workspace.trust.enabled",
            undefined,
            false,
        );
    }
}
