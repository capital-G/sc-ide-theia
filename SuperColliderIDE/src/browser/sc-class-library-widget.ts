import React from "@theia/core/shared/react";
import {
    inject,
    injectable,
    interfaces,
    postConstruct,
} from "@theia/core/shared/inversify";
import {
    AbstractViewContribution,
    FrontendApplicationContribution,
    OpenerService,
    TreeModel,
    TreeNode,
    TreeProps,
    ContextMenuRenderer,
    open,
    defaultTreeProps,
} from "@theia/core/lib/browser";
import {
    DirNode,
    FileNode,
    FileTreeModel,
    FileTreeWidget,
    createFileTreeContainer,
} from "@theia/filesystem/lib/browser";
import { FileService } from "@theia/filesystem/lib/browser/file-service";
import { URI } from "@theia/core";
import { ScClassLibraryLocator } from "./sc-class-library-locator";

export const SC_CLASS_LIBRARY_WIDGET_ID = "sc-class-library";

@injectable()
export class ScClassLibraryModel extends FileTreeModel {
    @inject(OpenerService) protected readonly openerService!: OpenerService;

    protected override doOpenNode(node: TreeNode): void {
        if (FileNode.is(node)) {
            open(this.openerService, node.uri);
        } else {
            super.doOpenNode(node);
        }
    }
}

/**
 * File browser rooted at the class library - where that is and when it
 * becomes reachable is up to the platform specific {@link ScClassLibraryLocator}.
 */
@injectable()
export class ScClassLibraryWidget extends FileTreeWidget {
    @inject(ScClassLibraryLocator)
    protected readonly locator!: ScClassLibraryLocator;
    @inject(FileService) protected readonly fileService!: FileService;

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(ScClassLibraryModel)
        override readonly model: ScClassLibraryModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
    ) {
        super(props, model, contextMenuRenderer);
        this.id = SC_CLASS_LIBRARY_WIDGET_ID;
        this.title.label = "Class Library";
        this.title.caption = "SuperCollider Class Library";
        this.title.iconClass = "codicon codicon-library";
        this.title.closable = true;
        this.addClass("sc-class-library");
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.toDispose.push(
            this.locator.onDidChangeRoot((uri) => this.setRoot(uri)),
        );
        this.setRoot(this.locator.root);
    }

    // not using model.location as it silently swallows resolve errors
    protected async setRoot(uri: URI | undefined): Promise<void> {
        if (!uri || this.model.location?.isEqual(uri)) {
            return;
        }
        try {
            const stat = await this.fileService.resolve(uri);
            await this.model.navigateTo(DirNode.createRoot(stat));
        } catch (e) {
            console.error(`could not open class library at ${uri}`, e);
        }
    }

    protected override renderTree(model: TreeModel): React.ReactNode {
        if (!model.root) {
            return React.createElement(
                "div",
                { className: "theia-widget-noInfo" },
                "The class library is available once the interpreter has been started.",
            );
        }
        return super.renderTree(model);
    }
}

export function createScClassLibraryWidget(
    parent: interfaces.Container,
): ScClassLibraryWidget {
    const child = createFileTreeContainer(parent, {
        model: ScClassLibraryModel,
        widget: ScClassLibraryWidget,
        props: { ...defaultTreeProps, search: true },
    });
    return child.get(ScClassLibraryWidget);
}

@injectable()
export class ScClassLibraryViewContribution
    extends AbstractViewContribution<ScClassLibraryWidget>
    implements FrontendApplicationContribution
{
    constructor() {
        super({
            widgetId: SC_CLASS_LIBRARY_WIDGET_ID,
            widgetName: "Class Library",
            defaultWidgetOptions: { area: "left", rank: 150 },
            toggleCommandId: "supercollider.classLibrary.toggle",
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView({ activate: false });
    }

    // initializeLayout is skipped when a previous layout gets restored,
    // so make sure the view is attached in that case as well
    async onDidInitializeLayout(): Promise<void> {
        await this.openView({ activate: false });
    }
}
