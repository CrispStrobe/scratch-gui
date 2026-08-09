/**
 * The bridge between the block editor and whatever knows the values.
 *
 * The editor's blocks and the debugger's runner live in different component
 * trees — the workspace is mounted by `containers/blocks.jsx`, the runner by the
 * Circuit tab's panel — and neither is the other's parent. Threading a runner
 * through the GUI to reach a hover handler would couple most of the editor to
 * the debugger for one tooltip.
 *
 * So the runner publishes a lookup here and the editor asks. One function, no
 * state of its own beyond the current resolver, and an editor with no debugger
 * attached simply gets null and shows nothing.
 *
 * @module
 */

/** @type {((blockId: string) => object | null) | null} */
let resolver = null;

/** The runner calls this when it attaches, and with null when it goes away. */
export function setValueResolver(fn) {
    resolver = typeof fn === 'function' ? fn : null;
}

/** What was recorded at this block, or null. Never throws at the caller. */
export function valuesAtBlock(blockId) {
    if (!resolver || !blockId) return null;
    try {
        return resolver(blockId);
    } catch {
        return null;
    }
}
