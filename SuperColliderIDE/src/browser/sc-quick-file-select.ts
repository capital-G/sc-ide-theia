import { CancellationToken, URI } from "@theia/core";
import { inject, injectable } from "@theia/core/shared/inversify";
import {
    QuickPickItemOrSeparator,
    QuickPicks,
    findMatches,
} from "@theia/core/lib/browser/quick-input/quick-input-service";
import {
    FileQuickPickItem,
    QuickFileSelectOptions,
    QuickFileSelectService,
} from "@theia/file-search/lib/browser/quick-file-select-service";
import { ScClassLibraryLocator } from "./sc-class-library-locator";

const CLASS_LIBRARY_LIMIT = 50;

/**
 * Adds the class library to the quick file open (ctrl+p), as it is
 * usually not part of the workspace.
 */
@injectable()
export class ScQuickFileSelectService extends QuickFileSelectService {
    @inject(ScClassLibraryLocator)
    protected readonly locator!: ScClassLibraryLocator;

    override async getPicks(
        fileFilter = "",
        token = CancellationToken.None,
        options: QuickFileSelectOptions = { hideIgnoredFiles: true },
    ): Promise<QuickPicks> {
        const picks = await super.getPicks(fileFilter, token, options);
        const root = this.locator.root;
        if (!root || fileFilter.length === 0) {
            return picks;
        }
        const results = await this.fileSearchService.find(
            fileFilter,
            {
                rootUris: [root.toString()],
                fuzzyMatch: true,
                limit: CLASS_LIBRARY_LIMIT,
                useGitIgnore: false,
            },
            token,
        );
        if (token.isCancellationRequested) {
            return picks;
        }
        // in case the class library is also part of the workspace
        const seen = new Set(
            picks
                .filter((p): p is FileQuickPickItem => FileQuickPickItem.is(p))
                .map((p) => p.uri.toString()),
        );
        const items = results
            .filter((uri) => !seen.has(uri))
            .map((uri) =>
                this.toClassLibraryItem(fileFilter, new URI(uri), options),
            )
            .sort((a, b) => this.compareItems(a, b, fileFilter));
        if (items.length === 0) {
            return picks;
        }
        const separator: QuickPickItemOrSeparator = {
            type: "separator",
            label: "class library",
        };
        return [...picks, separator, ...items];
    }

    // mirrors the private QuickFileSelectService.toItem
    protected toClassLibraryItem(
        lookFor: string,
        uri: URI,
        options: QuickFileSelectOptions,
    ): FileQuickPickItem {
        const label = this.labelProvider.getName(uri);
        const description = this.labelProvider.getDetails(uri);
        const icon = this.labelProvider
            .getIcon(uri)
            .split(" ")
            .filter((v) => v.length > 0);
        const item: FileQuickPickItem = {
            label,
            description,
            highlights: {
                label: findMatches(label, lookFor),
                description: findMatches(description, lookFor),
            },
            iconClasses: icon.length > 0 ? [...icon, "file-icon"] : icon,
            uri,
        };
        return { ...item, execute: () => options.onSelect?.(item) };
    }
}
