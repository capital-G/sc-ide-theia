import { injectable } from "@theia/core/shared/inversify";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import icon from "../../resources/supercollider.svg";

/**
 * Theia generates the index.html without a way to add a favicon,
 * so we add it once the frontend starts.
 */
@injectable()
export class ScFaviconContribution implements FrontendApplicationContribution {
    configure(): void {
        const link = document.createElement("link");
        link.rel = "icon";
        link.type = "image/svg+xml";
        link.href = icon;
        document.head.appendChild(link);
    }
}
