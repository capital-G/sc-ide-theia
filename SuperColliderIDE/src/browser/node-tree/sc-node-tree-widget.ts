import { BaseWidget, Message, StatefulWidget } from "@theia/core/lib/browser";
import {
    inject,
    injectable,
    postConstruct,
} from "@theia/core/shared/inversify";
import { ScServerWatcherService } from "../../common/protocol";
import { ScGroupNode } from "../../common/sc-node-tree";
import { ScServerStatus } from "../sc-server-status";
import {
    ScCardOptions,
    findNode,
    h,
    renderInspector,
    renderNode,
} from "./sc-node-tree-cards";
import { ScNodeTreeGraph } from "./sc-node-tree-graph";
import "../../../src/browser/style/node-tree.css";

export const SC_NODE_TREE_WIDGET_ID = "sc-node-tree";

/** like the default update rate of `s.plotTree` */
const POLL_INTERVAL_MS = 500;

export type ScNodeTreeMode = "boxes" | "graph";

interface ScNodeTreeState {
    mode: ScNodeTreeMode;
    showControls: boolean;
}

/**
 * The live node tree of the server, as nested boxes like `s.plotTree` or as a
 * graph. Controls can be edited, nodes paused and freed.
 */
@injectable()
export class ScNodeTreeWidget extends BaseWidget implements StatefulWidget {
    @inject(ScServerWatcherService)
    protected readonly watcher!: ScServerWatcherService;
    @inject(ScServerStatus) protected readonly serverStatus!: ScServerStatus;

    protected mode: ScNodeTreeMode = "boxes";
    protected showControls = true;
    protected pausedUpdates = false;
    protected tree: ScGroupNode | undefined;
    /** nodes paused from the IDE, the server does not report the run state */
    protected readonly paused = new Set<number>();
    protected inspected: number | undefined;

    protected timer: ReturnType<typeof setInterval> | undefined;
    protected querying = false;
    protected failed = false;

    protected header!: HTMLElement;
    protected boxes!: HTMLElement;
    protected graphView!: HTMLElement;
    protected inspector!: HTMLElement;
    protected placeholder!: HTMLElement;
    protected graph: ScNodeTreeGraph | undefined;

    @postConstruct()
    protected init(): void {
        this.id = SC_NODE_TREE_WIDGET_ID;
        this.title.label = "Node Tree";
        this.title.caption = "Node tree of the server";
        this.title.iconClass = "codicon codicon-type-hierarchy";
        this.title.closable = true;
        this.addClass("sc-node-tree");
        this.node.tabIndex = 0;

        this.header = h("div", { className: "sc-node-tree-toolbar" });
        this.boxes = h("div", { className: "sc-node-tree-boxes" });
        this.inspector = h("div", { className: "sc-node-tree-inspector" });
        this.graphView = h("div", { className: "sc-node-tree-graph-view" });
        this.placeholder = h("div", { className: "sc-node-tree-placeholder" });
        this.node.append(
            this.header,
            h(
                "div",
                { className: "sc-node-tree-body" },
                this.boxes,
                this.graphView,
                this.placeholder,
            ),
        );

        this.toDispose.push(
            this.serverStatus.onServerStatusChanged(() => this.schedule()),
        );
        this.toDispose.push({
            dispose: () => {
                this.stopPolling();
                this.graph?.dispose();
            },
        });
        this.renderHeader();
        this.renderBody();
    }

    storeState(): ScNodeTreeState {
        return { mode: this.mode, showControls: this.showControls };
    }

    restoreState(state: object): void {
        const { mode, showControls } = state as Partial<ScNodeTreeState>;
        if (mode === "boxes" || mode === "graph") {
            this.mode = mode;
        }
        if (typeof showControls === "boolean") {
            this.showControls = showControls;
        }
        this.renderHeader();
        this.renderBody();
    }

    setMode(mode: ScNodeTreeMode): void {
        this.mode = mode;
        this.graph?.invalidate();
        this.renderHeader();
        this.renderBody();
    }

    // --- polling ---

    protected get online(): boolean {
        return this.serverStatus.state.status === "online";
    }

    /** polls while visible and the server is running */
    protected schedule(): void {
        const active = this.isAttached && this.isVisible && this.online;
        if (active && !this.timer) {
            this.poll();
            this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
        } else if (!active) {
            this.stopPolling();
        }
        this.renderBody();
    }

    protected stopPolling(): void {
        clearInterval(this.timer);
        this.timer = undefined;
    }

    protected async poll(): Promise<void> {
        if (this.querying || this.pausedUpdates) {
            return;
        }
        this.querying = true;
        try {
            const tree = await this.watcher.queryTree(true);
            this.failed = !tree;
            if (tree) {
                this.tree = tree;
                // nodes which are gone can not be paused anymore
                for (const id of this.paused) {
                    if (!findNode(tree, id)) {
                        this.paused.delete(id);
                    }
                }
            }
        } catch {
            this.failed = true;
        } finally {
            this.querying = false;
        }
        this.renderBody();
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        // the graph can not be measured while hidden
        this.graph?.invalidate();
        this.graph?.updateCanvasBounds();
        this.schedule();
    }

    protected override onBeforeHide(msg: Message): void {
        super.onBeforeHide(msg);
        this.stopPolling();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.graph?.invalidate();
        this.schedule();
    }

    protected override onBeforeDetach(msg: Message): void {
        this.stopPolling();
        super.onBeforeDetach(msg);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    // --- actions ---

    protected get cardOptions(): ScCardOptions {
        return {
            showControls: this.showControls,
            paused: this.paused,
            actions: {
                setControl: (id, name, value) =>
                    this.afterAction(this.watcher.setControl(id, name, value)),
                run: (id, run) => {
                    if (run) {
                        this.paused.delete(id);
                    } else {
                        this.paused.add(id);
                    }
                    this.afterAction(this.watcher.runNode(id, run));
                },
                free: (id) => {
                    this.paused.delete(id);
                    this.afterAction(this.watcher.freeNode(id));
                },
                freeAll: (groupId) =>
                    this.afterAction(this.watcher.freeAll(groupId)),
            },
        };
    }

    /** shows the effect right away instead of with the next poll */
    protected async afterAction(action: Promise<void>): Promise<void> {
        await action;
        this.renderBody();
        await this.poll();
    }

    // --- rendering ---

    protected renderHeader(): void {
        const modeButton = (mode: ScNodeTreeMode, label: string) =>
            h("button", {
                className: `sc-node-tree-mode${this.mode === mode ? " active" : ""}`,
                textContent: label,
                onclick: () => this.setMode(mode),
            });
        const controls = h("input", {
            type: "checkbox",
            checked: this.showControls,
            onchange: () => {
                this.showControls = controls.checked;
                this.renderBody();
            },
        });
        const pause = h("input", {
            type: "checkbox",
            checked: this.pausedUpdates,
            onchange: () => {
                this.pausedUpdates = pause.checked;
                if (!this.pausedUpdates) {
                    this.poll();
                }
            },
        });
        this.header.replaceChildren(
            h(
                "div",
                { className: "sc-node-tree-modes" },
                modeButton("boxes", "Boxes"),
                modeButton("graph", "Graph"),
            ),
            h(
                "div",
                { className: "sc-node-tree-options" },
                h("label", {}, controls, "Controls"),
                h("label", {}, pause, "Freeze"),
                this.mode === "graph" &&
                    h("button", {
                        className:
                            "codicon codicon-screen-full sc-node-tree-action",
                        title: "Fit to view",
                        onclick: () => this.graph?.fit(),
                    }),
            ),
        );
    }

    protected renderBody(): void {
        const message = !this.online
            ? "Boot the server to see its node tree, e.g. via s.boot"
            : !this.tree
              ? this.failed
                  ? "The server did not answer the node tree query"
                  : "Querying the node tree…"
              : undefined;
        this.placeholder.textContent = message ?? "";
        this.placeholder.hidden = !message;
        this.boxes.hidden = !!message || this.mode !== "boxes";
        this.graphView.hidden = !!message || this.mode !== "graph";
        if (message || !this.tree) {
            return;
        }
        if (this.mode === "boxes") {
            this.renderBoxes(this.tree);
        } else {
            this.renderGraph(this.tree);
        }
    }

    /** keeps an input which is being edited */
    protected editing(container: HTMLElement): boolean {
        const active = document.activeElement;
        return active instanceof HTMLInputElement && container.contains(active);
    }

    protected renderBoxes(tree: ScGroupNode): void {
        if (!this.editing(this.boxes)) {
            this.boxes.replaceChildren(renderNode(tree, this.cardOptions));
        }
    }

    protected renderGraph(tree: ScGroupNode): void {
        if (!this.graph) {
            this.graph = new ScNodeTreeGraph((ids) => {
                this.inspected = ids[0];
                this.renderInspector();
            });
            this.graphView.append(this.graph.node, this.inspector);
        }
        if (this.isVisible) {
            this.graph.update(tree, this.showControls, this.paused);
        }
        this.renderInspector();
    }

    protected renderInspector(): void {
        if (this.editing(this.inspector)) {
            return;
        }
        const node =
            this.tree && this.inspected !== undefined
                ? findNode(this.tree, this.inspected)
                : undefined;
        this.inspector.replaceChildren(
            node
                ? renderInspector(node, {
                      ...this.cardOptions,
                      showControls: true,
                  })
                : h("div", {
                      className: "sc-node-tree-hint",
                      textContent:
                          "Select a node to edit its controls. Drag to pan, scroll to zoom.",
                  }),
        );
    }
}
