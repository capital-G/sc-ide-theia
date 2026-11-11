import {
    ScGroupNode,
    ScNode,
    ScSynthNode,
    isProtectedGroup,
} from "../../common/sc-node-tree";

/** what the cards can do with a node, sent as OSC to the server */
export interface ScNodeActions {
    setControl(id: number, name: string, value: number): void;
    run(id: number, run: boolean): void;
    free(id: number): void;
    freeAll(groupId: number): void;
}

export interface ScCardOptions {
    showControls: boolean;
    /** nodes paused from the IDE - the query reply has no run state */
    paused: ReadonlySet<number>;
    actions: ScNodeActions;
}

/** creates an element w/ properties and children */
export function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> = {},
    ...children: (Node | string | false | undefined)[]
): HTMLElementTagNameMap[K] {
    const element = Object.assign(document.createElement(tag), props);
    for (const child of children) {
        if (child !== false && child !== undefined) {
            element.append(child);
        }
    }
    return element;
}

function iconButton(
    icon: string,
    title: string,
    onclick: () => void,
): HTMLButtonElement {
    return h("button", {
        className: `codicon codicon-${icon} sc-node-tree-action`,
        title,
        onclick: (e: MouseEvent) => {
            e.stopPropagation();
            onclick();
        },
    });
}

/** a short, readable number, e.g. 440 or 0.1234 */
export function formatValue(value: number): string {
    return Number.isInteger(value)
        ? `${value}`
        : `${Number(value.toPrecision(6))}`;
}

export function nodeLabel(node: ScNode): string {
    return node.kind === "group"
        ? `Group ${node.id}`
        : `${node.id} \\${node.defName}`;
}

/** the actions of a node's header */
export function renderActions(
    node: ScNode,
    options: ScCardOptions,
): HTMLElement {
    const { actions, paused } = options;
    const buttons: HTMLElement[] = [];
    if (node.kind === "synth") {
        const isPaused = paused.has(node.id);
        buttons.push(
            iconButton(
                isPaused ? "debug-start" : "debug-pause",
                isPaused ? "Resume" : "Pause",
                () => actions.run(node.id, isPaused),
            ),
            iconButton("close", "Free", () => actions.free(node.id)),
        );
    } else {
        buttons.push(
            iconButton("clear-all", "Free all children", () =>
                actions.freeAll(node.id),
            ),
        );
        if (!isProtectedGroup(node.id)) {
            buttons.push(
                iconButton("close", "Free group", () => actions.free(node.id)),
            );
        }
    }
    return h("span", { className: "sc-node-tree-actions" }, ...buttons);
}

/**
 * The controls of a synth as editable values, a value gets sent on enter or blur.
 * Bus mappings like `c1` are shown read-only.
 */
export function renderControls(
    synth: ScSynthNode,
    options: ScCardOptions,
): HTMLElement {
    if (synth.controls.length === 0) {
        return h("div", {
            className: "sc-node-tree-no-controls",
            textContent: "No controls",
        });
    }
    return h(
        "div",
        { className: "sc-node-tree-controls" },
        ...synth.controls.map(({ name, value }) => {
            const label = h("label", { textContent: name, title: name });
            const pair = (field: HTMLElement) =>
                h("div", { className: "sc-node-tree-control" }, label, field);
            if (typeof value === "string") {
                return pair(
                    h("span", {
                        className: "sc-node-tree-mapped",
                        textContent: value,
                        title: `mapped to ${value[0] === "a" ? "audio" : "control"} bus ${value.slice(1)}`,
                    }),
                );
            }
            const shown = formatValue(value);
            const input: HTMLInputElement = h("input", {
                className: "theia-input sc-node-tree-value",
                type: "text",
                inputMode: "decimal",
                spellcheck: false,
                value: shown,
                title: `${value}`,
                onkeydown: (e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                        input.blur();
                    } else if (e.key === "Escape") {
                        input.value = shown;
                        input.blur();
                    }
                },
                onchange: () => {
                    const parsed = Number(input.value.trim());
                    if (input.value.trim() === "" || !Number.isFinite(parsed)) {
                        input.value = shown;
                        return;
                    }
                    options.actions.setControl(synth.id, name, parsed);
                },
            });
            return pair(input);
        }),
    );
}

function renderSynth(synth: ScSynthNode, options: ScCardOptions): HTMLElement {
    return h(
        "div",
        {
            className: `sc-node-tree-synth${options.paused.has(synth.id) ? " paused" : ""}`,
        },
        h(
            "div",
            { className: "sc-node-tree-header" },
            h("span", {
                className: "sc-node-tree-title",
                textContent: nodeLabel(synth),
                title: nodeLabel(synth),
            }),
            renderActions(synth, options),
        ),
        options.showControls && renderControls(synth, options),
    );
}

function renderGroup(group: ScGroupNode, options: ScCardOptions): HTMLElement {
    return h(
        "div",
        { className: "sc-node-tree-group" },
        h(
            "div",
            { className: "sc-node-tree-header" },
            h("span", {
                className: "sc-node-tree-title",
                textContent: nodeLabel(group),
            }),
            renderActions(group, options),
        ),
        ...group.children.map((child) => renderNode(child, options)),
    );
}

/** nested boxes like `s.plotTree`: groups contain their children in execution order */
export function renderNode(node: ScNode, options: ScCardOptions): HTMLElement {
    return node.kind === "group"
        ? renderGroup(node, options)
        : renderSynth(node, options);
}

/** a single node w/o its children, e.g. for the inspector of the graph */
export function renderInspector(
    node: ScNode,
    options: ScCardOptions,
): HTMLElement {
    return h(
        "div",
        { className: "sc-node-tree-inspected" },
        h(
            "div",
            { className: "sc-node-tree-header" },
            h("span", {
                className: "sc-node-tree-title",
                textContent: nodeLabel(node),
            }),
            renderActions(node, options),
        ),
        node.kind === "synth"
            ? renderControls(node, options)
            : h("div", {
                  className: "sc-node-tree-no-controls",
                  textContent: `${node.children.length} children`,
              }),
    );
}

export function findNode(root: ScNode, id: number): ScNode | undefined {
    if (root.id === id) {
        return root;
    }
    if (root.kind === "group") {
        for (const child of root.children) {
            const found = findNode(child, id);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}
