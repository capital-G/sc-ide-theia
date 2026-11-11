import OSC from "osc-js";

/**
 * The node tree of scsynth, see `/g_queryTree` in the Server Command Reference.
 * Queried directly from the server, like the `/status` of the server watcher.
 */

export interface ScControl {
    /** the name, or the index for controls w/o a name */
    name: string;
    /** a value, or a bus mapping like `c1` or `a1` */
    value: number | string;
}

export interface ScSynthNode {
    kind: "synth";
    id: number;
    defName: string;
    /** empty if the tree got queried w/o controls */
    controls: ScControl[];
}

export interface ScGroupNode {
    kind: "group";
    id: number;
    children: ScNode[];
}

export type ScNode = ScSynthNode | ScGroupNode;

export const SC_QUERY_TREE_REPLY = "/g_queryTree.reply";

/** the whole tree starting at the root group, optionally w/ the controls of the synths */
export function queryTreeMessage(controls: boolean, group = 0): Uint8Array {
    return new OSC.Message("/g_queryTree", group, controls ? 1 : 0).pack();
}

/**
 * Parses the flat, depth-first encoding of `/g_queryTree.reply`:
 * `flag, id, numChildren` of the queried group, then for each node `id, numChildren`
 * (-1 for a synth) followed by `defName` and, if `flag` is set,
 * `numControls` and the `name, value` pairs of a synth.
 */
export function parseQueryTreeReply(args: unknown[]): ScGroupNode | undefined {
    const withControls = args[0] === 1;
    let i = 1;
    const int = (): number => {
        const value = args[i++];
        if (typeof value !== "number") {
            throw new Error(`expected a number at ${i - 1}`);
        }
        return value;
    };
    const str = (): string => {
        const value = args[i++];
        if (typeof value === "string") {
            return value;
        }
        if (typeof value === "number") {
            return `${value}`;
        }
        throw new Error(`expected a string at ${i - 1}`);
    };
    const node = (): ScNode => {
        const id = int();
        const numChildren = int();
        if (numChildren < 0) {
            const defName = str();
            const controls: ScControl[] = [];
            if (withControls) {
                const numControls = int();
                for (let c = 0; c < numControls; c++) {
                    const name = str();
                    const value = args[i++];
                    if (
                        typeof value !== "number" &&
                        typeof value !== "string"
                    ) {
                        throw new Error(`expected a control value at ${i - 1}`);
                    }
                    controls.push({ name, value });
                }
            }
            return { kind: "synth", id, defName, controls };
        }
        const children: ScNode[] = [];
        for (let c = 0; c < numChildren; c++) {
            children.push(node());
        }
        return { kind: "group", id, children };
    };
    try {
        const root = node();
        return root.kind === "group" ? root : undefined;
    } catch {
        // e.g. a truncated reply
        return undefined;
    }
}

/** sets a control of a node, `/n_set` - scsynth accepts int and float values */
export function setControlMessage(
    id: number,
    name: string,
    value: number,
): Uint8Array {
    // a numeric name addresses a control by its index
    const control = /^\d+$/.test(name) ? Number(name) : name;
    return new OSC.Message("/n_set", id, control, value).pack();
}

/** pauses or resumes a node, `/n_run` */
export function runNodeMessage(id: number, run: boolean): Uint8Array {
    return new OSC.Message("/n_run", id, run ? 1 : 0).pack();
}

/** frees a node, for a group incl. all its children, `/n_free` */
export function freeNodeMessage(id: number): Uint8Array {
    return new OSC.Message("/n_free", id).pack();
}

/** frees all children of a group, `/g_freeAll` */
export function freeAllMessage(groupId: number): Uint8Array {
    return new OSC.Message("/g_freeAll", groupId).pack();
}

/** the root group and the default group of sclang should not be freed */
export function isProtectedGroup(id: number): boolean {
    return id === 0 || id === 1;
}
