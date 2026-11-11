/** @jsx svg */
import {
    Container,
    ContainerModule,
    inject,
    injectable,
} from "@theia/core/shared/inversify";
import ElkConstructor from "elkjs/lib/elk.bundled.js";
import { VNode } from "snabbdom";
import {
    IActionDispatcher,
    IActionHandler,
    InitializeCanvasBoundsAction,
    LocalModelSource,
    PolylineEdgeView,
    RenderingContext,
    SEdgeImpl,
    SGraphImpl,
    SGraphView,
    SLabelImpl,
    SLabelView,
    SNodeImpl,
    ShapeView,
    TYPES,
    configureActionHandler,
    configureModelElement,
    configureViewerOptions,
    loadDefaultModules,
    moveFeature,
    deletableFeature,
    svg,
} from "sprotty";
import {
    FitToScreenAction,
    SEdge,
    SGraph,
    SLabel,
    SModelElement,
    SNode,
    SelectAction,
    SelectAllAction,
} from "sprotty-protocol";
import {
    DefaultLayoutConfigurator,
    ElkFactory,
    ElkLayoutEngine,
    ILayoutConfigurator,
    elkLayoutModule,
} from "sprotty-elk";
import type { LayoutOptions } from "elkjs/lib/elk-api";
import "sprotty/css/sprotty.css";
import { ScGroupNode, ScNode } from "../../common/sc-node-tree";
import { formatValue, nodeLabel } from "./sc-node-tree-cards";

/** a graph node shows at most this many controls, the inspector shows all */
const MAX_GRAPH_CONTROLS = 6;

const SelectionListener = Symbol("SelectionListener");
type SelectionListener = () => void;

/** the sprotty id of a node */
export const graphId = (id: number) => `n${id}`;
const nodeIdOf = (graphId: string) =>
    /^n\d+$/.test(graphId) ? Number(graphId.slice(1)) : undefined;

/**
 * Left to right in execution order: the layered algorithm would sort siblings to
 * reduce crossings, the model order keeps the order of the server.
 */
@injectable()
class ScLayoutConfigurator extends DefaultLayoutConfigurator {
    protected override graphOptions(): LayoutOptions {
        return {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.edgeRouting": "ORTHOGONAL",
            "elk.spacing.nodeNode": "10",
            "elk.layered.spacing.nodeNodeBetweenLayers": "36",
            "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
            "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
            "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        };
    }
}

/** a rounded box, group and synth are told apart by css */
@injectable()
class ScGraphNodeView extends ShapeView {
    render(
        node: Readonly<SNodeImpl & { paused?: boolean }>,
        context: RenderingContext,
    ): VNode | undefined {
        if (!this.isVisible(node, context)) {
            return undefined;
        }
        const group = node.type === "node:group";
        return (
            <g
                class-sc-graph-node={true}
                class-sc-graph-group={group}
                class-sc-graph-synth={!group}
                class-sc-graph-paused={!!node.paused}
                class-selected={node.selected}
                class-mouseover={node.hoverFeedback}
            >
                <rect
                    class-sc-graph-box={true}
                    x="0"
                    y="0"
                    rx="4"
                    ry="4"
                    width={Math.max(node.size.width, 0)}
                    height={Math.max(node.size.height, 0)}
                />
                {context.renderChildren(node)}
            </g>
        );
    }
}

/** forwards selection changes, the inspector shows the selected node */
@injectable()
class ScSelectionHandler implements IActionHandler {
    @inject(SelectionListener) protected readonly listener!: SelectionListener;

    handle(): void {
        // the selection is applied by a command after the handlers ran
        setTimeout(() => this.listener(), 0);
    }
}

function label(id: string, text: string, kind: "title" | "control"): SLabel {
    return { type: `label:${kind}`, id, text } as SLabel;
}

/** converts the tree into nodes and parent -> child edges, in execution order */
export function toGraph(
    root: ScGroupNode,
    showControls: boolean,
    paused: ReadonlySet<number>,
): SGraph {
    const children: SModelElement[] = [];
    const visit = (node: ScNode, parent?: ScNode) => {
        const id = graphId(node.id);
        const labels: SLabel[] = [
            label(`${id}-title`, nodeLabel(node), "title"),
        ];
        if (node.kind === "synth" && showControls) {
            const shown = node.controls.slice(0, MAX_GRAPH_CONTROLS);
            for (const { name, value } of shown) {
                const text = `${name} ${typeof value === "number" ? formatValue(value) : value}`;
                labels.push(label(`${id}-c-${name}`, text, "control"));
            }
            if (node.controls.length > shown.length) {
                labels.push(
                    label(
                        `${id}-more`,
                        `+${node.controls.length - shown.length} more`,
                        "control",
                    ),
                );
            }
        }
        children.push({
            type: node.kind === "group" ? "node:group" : "node:synth",
            id,
            layout: "vbox",
            layoutOptions: {
                hAlign: "left",
                paddingTop: 5,
                paddingBottom: 5,
                paddingLeft: 8,
                paddingRight: 8,
                vGap: 1,
            },
            paused: node.kind === "synth" && paused.has(node.id),
            children: labels,
        } as SNode & { paused: boolean });
        if (parent) {
            children.push({
                type: "edge",
                id: `e${parent.id}-${node.id}`,
                sourceId: graphId(parent.id),
                targetId: id,
            } as SEdge);
        }
        if (node.kind === "group") {
            node.children.forEach((child) => visit(child, node));
        }
    };
    visit(root);
    return { type: "graph", id: "sc-node-tree", children };
}

let instances = 0;

/**
 * The node tree as a sprotty diagram, laid out by ELK. Model updates get
 * animated, the diagram can be panned and zoomed.
 */
export class ScNodeTreeGraph {
    /** contains the visible and the hidden (measuring) rendering */
    readonly node: HTMLElement;
    protected readonly source: LocalModelSource;
    protected readonly dispatcher: IActionDispatcher;
    protected lastModel = "";
    protected initialized = false;
    /** sprotty only listens to window resizes, but the widget gets resized by splits as well */
    protected readonly resizeObserver = new ResizeObserver(() =>
        this.updateCanvasBounds(),
    );

    constructor(onSelectionChanged: (ids: number[]) => void) {
        const baseDiv = `sc-node-tree-graph-${instances++}`;
        this.node = document.createElement("div");
        this.node.className = "sc-node-tree-graph";
        const base = document.createElement("div");
        base.id = baseDiv;
        const hidden = document.createElement("div");
        hidden.id = `${baseDiv}_hidden`;
        this.node.append(base, hidden);

        const module = new ContainerModule((bind, unbind, isBound, rebind) => {
            const context = { bind, unbind, isBound, rebind };
            bind(TYPES.ModelSource).to(LocalModelSource).inSingletonScope();
            configureModelElement(context, "graph", SGraphImpl, SGraphView);
            for (const type of ["node:group", "node:synth"]) {
                configureModelElement(
                    context,
                    type,
                    SNodeImpl,
                    ScGraphNodeView,
                    {
                        // positions come from the layout, nodes are not editable
                        disable: [moveFeature, deletableFeature],
                    },
                );
            }
            configureModelElement(
                context,
                "label:title",
                SLabelImpl,
                SLabelView,
            );
            configureModelElement(
                context,
                "label:control",
                SLabelImpl,
                SLabelView,
            );
            configureModelElement(
                context,
                "edge",
                SEdgeImpl,
                PolylineEdgeView,
                {
                    disable: [deletableFeature],
                },
            );
            configureViewerOptions(context, {
                baseDiv,
                hiddenDiv: `${baseDiv}_hidden`,
                popupDiv: `${baseDiv}_popup`,
                needsClientLayout: true,
                needsServerLayout: false,
                zoomLimits: { min: 0.1, max: 4 },
            });
            bind(TYPES.IModelLayoutEngine).toService(ElkLayoutEngine);
            bind(ElkFactory).toConstantValue(
                () => new ElkConstructor({ algorithms: ["layered"] }),
            );
            rebind(ILayoutConfigurator).to(ScLayoutConfigurator);
            bind(SelectionListener).toConstantValue(() =>
                this.selection().then(onSelectionChanged),
            );
            configureActionHandler(
                context,
                SelectAction.KIND,
                ScSelectionHandler,
            );
            configureActionHandler(
                context,
                SelectAllAction.KIND,
                ScSelectionHandler,
            );
        });
        const container = new Container();
        loadDefaultModules(container);
        container.load(elkLayoutModule, module);
        this.source = container.get<LocalModelSource>(TYPES.ModelSource);
        this.dispatcher = container.get<IActionDispatcher>(
            TYPES.IActionDispatcher,
        );
        this.resizeObserver.observe(this.node);
    }

    /** the canvas bounds in page coordinates, used for zooming and hit tests */
    updateCanvasBounds(): void {
        const base = this.node.firstElementChild;
        if (!this.initialized || !base) {
            return;
        }
        const { x, y, width, height } = base.getBoundingClientRect();
        if (width > 0 && height > 0) {
            this.dispatcher.dispatch(
                InitializeCanvasBoundsAction.create({ x, y, width, height }),
            );
        }
    }

    /** must only be called while the graph is attached and visible, it gets measured */
    async update(
        tree: ScGroupNode,
        showControls: boolean,
        paused: ReadonlySet<number>,
    ): Promise<void> {
        const model = toGraph(tree, showControls, paused);
        const json = JSON.stringify(model);
        if (json === this.lastModel) {
            return;
        }
        this.lastModel = json;
        if (!this.initialized) {
            this.initialized = true;
            await this.source.setModel(model);
            this.fit(false);
        } else {
            await this.source.updateModel(model);
        }
    }

    /** the next update renders anew, e.g. after the graph was hidden */
    invalidate(): void {
        this.lastModel = "";
    }

    fit(animate = true): void {
        this.dispatcher.dispatch(
            FitToScreenAction.create([], {
                padding: 16,
                maxZoom: 1.5,
                animate,
            }),
        );
    }

    async selection(): Promise<number[]> {
        const ids: number[] = [];
        for (const element of await this.source.getSelection()) {
            const id = nodeIdOf(element.id);
            if (id !== undefined) {
                ids.push(id);
            }
        }
        return ids;
    }

    dispose(): void {
        this.resizeObserver.disconnect();
        this.node.remove();
        document
            .getElementById(`${this.node.firstElementChild?.id}_popup`)
            ?.remove();
    }
}
