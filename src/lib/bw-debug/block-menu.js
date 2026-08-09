/**
 * "Pause here" — the debugger's one piece of input in the block editor.
 *
 * `debugger-ui.md` §3: a breakpoint is a right-click on a block, because that
 * is how every editor does it and because the alternative (a list of task and
 * state numbers) is not something a Scratch user can act on.
 *
 * Two decisions are visible here.
 *
 * **The menu item appears only for hardware projects.** The block editor is
 * shared with ordinary Scratch projects, where "Pause here" would be an item
 * that can never do anything. The gate is the same one the Circuit tab uses:
 * the project declares pins.
 *
 * **It is offered on every block, not only on yield points.** The user cannot
 * see which blocks the program can actually stop at — a `wait` and a `turn on`
 * look equally stoppable — so refusing the click on one and accepting it on its
 * neighbour reads as a broken editor. Every block can be marked; the runner
 * resolves the ones this build has a yield point for and reports the rest as
 * unreachable, which the panel shows. That is the "snap forward and say so"
 * rule from §3, with the saying-so done by the panel rather than by a dialog.
 *
 * @module
 */

import { isBreakpoint, toggleBreakpoint, subscribeBreakpoints } from './breakpoints.js';

const MARKED_CLASS = 'bw-breakpoint';

const TEXT = {
    en: { set: '⏸ Pause here', clear: '⏸ Don’t pause here' },
    de: { set: '⏸ Hier anhalten', clear: '⏸ Hier nicht anhalten' }
};

/**
 * The marker. Blockly owns the block's SVG, so this only adds a class and lets
 * CSS do the rest — anything that reaches into the generated shapes would be
 * undone by the next re-render.
 */
const CSS = `
.${MARKED_CLASS} > .blocklyPath {
    stroke: #e74c3c;
    stroke-width: 3px;
}
`;

let installed = false;

/**
 * Install the context-menu item and the marker.
 *
 * @param {object} ScratchBlocks the injected scratch-blocks namespace
 * @param {object} vm the scratch-vm instance, for the hardware-project gate
 * @param {() => string} getLocale
 * @returns {() => void} uninstall
 */
export function installBreakpointMenu(ScratchBlocks, vm, getLocale = () => 'en') {
    const inert = { repaint() {}, uninstall() {} };
    if (installed || !ScratchBlocks || !ScratchBlocks.BlockSvg) return inert;
    installed = true;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    /** Does this project have hardware to debug? */
    const isHardwareProject = () => {
        // vm.runtime.stc is the cheap path; toJSON on every right-click would
        // serialise the whole project to answer a yes/no question.
        const stc = vm && vm.runtime && vm.runtime.stc;
        return !!(stc && stc.pins && stc.pins.length);
    };

    // Some blocks define their own customContextMenu as a mixin (procedure
    // calls do), which shadows the prototype. That is acceptable here: a
    // `procedures_call` is never a yield point — custom blocks run to
    // completion in Scratch, and generateC emits them as plain C functions.
    const previous = ScratchBlocks.BlockSvg.prototype.customContextMenu;
    ScratchBlocks.BlockSvg.prototype.customContextMenu = function (options) {
        if (previous) previous.call(this, options);
        if (!isHardwareProject()) return;
        const words = TEXT[getLocale()] || TEXT.en;
        const marked = isBreakpoint(this.id);
        options.push({
            enabled: true,
            text: marked ? words.clear : words.set,
            callback: () => {
                toggleBreakpoint(this.id);
                paint(this.workspace);
            }
        });
    };

    /** Put the marker class on every marked block that is currently rendered. */
    function paint(workspace) {
        if (!workspace || !workspace.getAllBlocks) return;
        for (const block of workspace.getAllBlocks()) {
            const svg = block.getSvgRoot && block.getSvgRoot();
            if (!svg || !svg.classList) continue;
            svg.classList.toggle(MARKED_CLASS, isBreakpoint(block.id));
        }
    }

    // Re-paint whenever the set changes or the workspace redraws. Blockly
    // rebuilds SVG on load, drag and undo, and a class set once would quietly
    // disappear on any of them.
    let workspaceRef = null;
    const unsubscribe = subscribeBreakpoints(() => paint(workspaceRef));

    const repaint = (workspace) => { workspaceRef = workspace; paint(workspace); };

    return {
        repaint,
        uninstall() {
            unsubscribe();
            ScratchBlocks.BlockSvg.prototype.customContextMenu = previous;
            if (style.parentNode) style.parentNode.removeChild(style);
            installed = false;
        }
    };
}
