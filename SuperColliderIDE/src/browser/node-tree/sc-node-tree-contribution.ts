import { CommandRegistry } from "@theia/core";
import { AbstractViewContribution } from "@theia/core/lib/browser";
import { injectable } from "@theia/core/shared/inversify";
import { ScShowNodeTree } from "../sc-contribution";
import {
    SC_NODE_TREE_WIDGET_ID,
    ScNodeTreeWidget,
} from "./sc-node-tree-widget";

/** the node tree opens like an editor tab, to the right of the code */
@injectable()
export class ScNodeTreeContribution extends AbstractViewContribution<ScNodeTreeWidget> {
    constructor() {
        super({
            widgetId: SC_NODE_TREE_WIDGET_ID,
            widgetName: "Node Tree",
            defaultWidgetOptions: { area: "main", mode: "split-right" },
        });
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(ScShowNodeTree, {
            execute: () => this.openView({ activate: true, reveal: true }),
        });
    }
}
