/**
 * Where breakpoints live.
 *
 * They are kept HERE rather than inside the runner because the two have
 * different lifetimes and the user's is the longer one: you set a breakpoint by
 * right-clicking a block, which you do before pressing ⚑, when no runner, no
 * emulator and no symbol table exist yet. A store owned by the runner would
 * drop everything set before the first run and again on every stop.
 *
 * So the model is: **the user's breakpoints are a property of the project, and
 * the runner subscribes to them.** A block id is the key, because that is the
 * thing the user actually pointed at — not a task, not a state, not an address,
 * all of which are minted afresh by every build.
 *
 * A block that is not a yield point can still be marked. The runner resolves
 * what it can when it attaches and reports the rest as unreachable, which is a
 * better answer than refusing the click on a block that looks, to the user,
 * exactly like its neighbour (`debugger-ui.md` §3).
 *
 * @module
 */

/** @type {Set<string>} block ids the user has marked. */
const marked = new Set();

/** @type {Set<(ids: string[]) => void>} */
const listeners = new Set();

function notify() {
    const ids = [...marked];
    for (const cb of listeners) cb(ids);
}

/** Is this block marked? */
export function isBreakpoint(blockId) {
    return marked.has(blockId);
}

/** Every marked block, in insertion order. */
export function listBreakpoints() {
    return [...marked];
}

/**
 * Mark or unmark a block.
 * @returns {boolean} true if it is now marked
 */
export function toggleBreakpoint(blockId) {
    if (!blockId) return false;
    if (marked.has(blockId)) marked.delete(blockId);
    else marked.add(blockId);
    notify();
    return marked.has(blockId);
}

/** Forget everything. Loading a different project should call this. */
export function clearBreakpoints() {
    if (!marked.size) return;
    marked.clear();
    notify();
}

/**
 * Watch the set. Calls back immediately with the current contents, so a
 * subscriber never has to ask separately for the state it just missed.
 * @returns {() => void} unsubscribe
 */
export function subscribeBreakpoints(cb) {
    listeners.add(cb);
    cb([...marked]);
    return () => listeners.delete(cb);
}
