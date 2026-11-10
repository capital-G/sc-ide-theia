import { inject, injectable } from "@theia/core/shared/inversify";
import { BackendApplicationContribution } from "@theia/core/lib/node";
import { Application } from "express";
import { access } from "fs/promises";
import { join } from "path";
import { resolveHelpRequest, SC_HELP_ROUTE } from "../common/sc-help";
import { ScServiceImpl } from "./sc-service-impl";

/**
 * Serves `SCDoc.helpTargetDir` at {@link SC_HELP_ROUTE} for the help browser
 * and lets sclang render the pages on demand.
 */
@injectable()
export class ScHelpRoute implements BackendApplicationContribution {
    @inject(ScServiceImpl) protected readonly scService!: ScServiceImpl;

    /** does not change during the lifetime of the interpreter */
    protected helpDir: string | undefined;

    configure(app: Application): void {
        app.get(`${SC_HELP_ROUTE}*`, async (req, res) => {
            try {
                const helpDir = await this.resolveHelpDir();
                const response = await resolveHelpRequest(
                    {
                        prepareHelp: (path) => this.scService.prepareHelp(path),
                        exists: async (path) =>
                            !!helpDir &&
                            access(join(helpDir, path)).then(
                                () => true,
                                () => false,
                            ),
                    },
                    req.path,
                );
                switch (response.kind) {
                    case "redirect":
                        res.redirect(302, response.location);
                        return;
                    case "error":
                        res.status(response.status)
                            .type("html")
                            .send(response.html);
                        return;
                    case "file":
                        if (!helpDir) {
                            res.sendStatus(503);
                            return;
                        }
                        res.sendFile(response.path, {
                            // prevents escaping the help dir
                            root: helpDir,
                            headers: {
                                "Content-Type": response.contentType,
                                // pages get re-rendered if their source changes
                                "Cache-Control": "no-cache",
                            },
                        });
                        return;
                }
            } catch (e) {
                console.error("sc help route failed", e);
                res.sendStatus(500);
            }
        });
    }

    protected async resolveHelpDir(): Promise<string | undefined> {
        if (!this.helpDir) {
            this.helpDir = await this.scService.queryHelpTargetDir();
        }
        return this.helpDir;
    }
}
