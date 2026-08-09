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

import {
    isBreakpoint, toggleBreakpoint, subscribeBreakpoints, conditionOf
} from './breakpoints.js';
import { valuesAtBlock } from './hover-values.js';

const MARKED_CLASS = 'bw-breakpoint';

const TEXT = {
    en: {
        set: '⏸ Pause here', clear: '⏸ Don’t pause here',
        when: '⏸ Pause here when…',
        lastHere: 'last here', ago: 'ago', hereNow: 'here now',
        noVars: 'no variables in this project',
        prompt: 'Pause here only when this is true.\n\nFor example:  counter > 10\n' +
            'Comparisons only (> < >= <= = !=), joined with and / or.'
    },
    de: {
        set: '⏸ Hier anhalten', clear: '⏸ Hier nicht anhalten',
        when: '⏸ Hier anhalten, wenn…',
        lastHere: 'zuletzt hier vor', ago: '', hereNow: 'jetzt hier',
        noVars: 'keine Variablen in diesem Projekt',
        prompt: 'Nur anhalten, wenn das zutrifft.\n\nZum Beispiel:  counter > 10\n' +
            'Nur Vergleiche (> < >= <= = !=), verknüpft mit and / or.'
    }
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
.bw-hover-values {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
    background: #12121f;
    border: 1px solid #2c3e50;
    border-radius: 6px;
    padding: 6px 9px;
    font: 12px/1.45 monospace;
    color: #ecf0f1;
    box-shadow: 0 4px 14px rgba(0,0,0,.45);
    max-width: 280px;
}
.bw-hover-values .bw-when { color: #7f8c8d; font-size: 11px; }
.bw-hover-values .bw-name { color: #bdc3c7; }
.bw-hover-values .bw-val  { color: #f39c12; }
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
export function installBreakpointMenu(ScratchBlocks, vm, getLocale = () => 'en', onCondition = null) {
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

    // Hook generateContextMenu, NOT customContextMenu.
    //
    // Defining customContextMenu on the prototype looks equivalent and breaks
    // Blockly: its Block.mixin() refuses a mixin whose members already exist,
    // and the check is `this[key] !== undefined`, which inherited prototype
    // properties satisfy. So a prototype-level customContextMenu makes every
    // block type that legitimately defines one — procedure calls do — throw
    // "Mixin will overwrite block members" at load. That error was live on the
    // deployed editor; one of the two menus was being clobbered and which one
    // depended on load order.
    //
    // generateContextMenu is the supported override point: Blockly calls it to
    // build the option list and then calls customContextMenu on top, so
    // appending here lands in the same place and collides with nothing.
    const previous = ScratchBlocks.BlockSvg.prototype.generateContextMenu;
    ScratchBlocks.BlockSvg.prototype.generateContextMenu = function () {
        const options = previous ? previous.call(this) : [];
        this.bwAddDebugMenu(options);
        return options;
    };
    ScratchBlocks.BlockSvg.prototype.bwAddDebugMenu = function (options) {
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
        // The conditional form is a SEPARATE item rather than a mode, so the
        // plain one stays a single click. A condition already set is offered
        // back for editing instead of making the user retype it.
        options.push({
            enabled: true,
            text: words.when,
            callback: () => {
                const existing = conditionOf(this.id) || '';
                const source = window.prompt(words.prompt, existing);
                if (source === null) return;
                if (onCondition) onCondition(this.id, source.trim());
                paint(this.workspace);
            }
        });
    };

    // ─── hover: what was `counter` HERE? ─────────────────────────────────
    //
    // The question a learner actually has, and the one a live-values pane
    // cannot answer — by the time you look, the program has moved on. Every
    // recorded stop carries a full variable snapshot and the position it was
    // taken at, so hovering a block can show what was true the last time the
    // program was there.
    //
    // It says WHEN, always. A value with no timestamp beside it reads as
    // current, and the whole point is that it is not.

    let tip = null;
    /** Blocks that already have listeners, so repainting does not stack them. */
    const wired = new WeakSet();

    function hideTip() {
        if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
        tip = null;
    }

    function showTip(block, at) {
        hideTip();
        const words = TEXT[getLocale()] || TEXT.en;
        tip = document.createElement('div');
        tip.className = 'bw-hover-values';
        const when = at.agoMs < 1
            ? words.hereNow
            : `${words.lastHere} ${at.agoMs < 1000
                ? `${at.agoMs.toFixed(0)} ms` : `${(at.agoMs / 1000).toFixed(1)} s`} ${words.ago}`;
        const rows = at.variables.length
            ? at.variables.map((v) =>
                `<div><span class="bw-name">${escapeHtml(v.name)}</span> ` +
                `<span class="bw-val">${v.value}</span></div>`).join('')
            : `<div class="bw-when">${words.noVars}</div>`;
        tip.innerHTML = `<div class="bw-when">${when}</div>${rows}`;
        document.body.appendChild(tip);

        const svg = block.getSvgRoot();
        const box = svg.getBoundingClientRect();
        tip.style.left = `${Math.min(box.right + 8, window.innerWidth - tip.offsetWidth - 8)}px`;
        tip.style.top = `${Math.max(8, box.top)}px`;
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"]/g, (ch) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    }

    /** Put the marker class on every marked block, and wire hover once each. */
    function paint(workspace) {
        if (!workspace || !workspace.getAllBlocks) return;
        for (const block of workspace.getAllBlocks()) {
            const svg = block.getSvgRoot && block.getSvgRoot();
            if (!svg || !svg.classList) continue;
            svg.classList.toggle(MARKED_CLASS, isBreakpoint(block.id));

            if (wired.has(svg)) continue;
            wired.add(svg);
            svg.addEventListener('mouseenter', () => {
                const at = valuesAtBlock(block.id);
                // No recording at this block is a real answer, and a tooltip
                // saying nothing would be worse than none at all.
                if (at) showTip(block, at);
            });
            svg.addEventListener('mouseleave', hideTip);
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
            hideTip();
            unsubscribe();
            ScratchBlocks.BlockSvg.prototype.generateContextMenu = previous;
            delete ScratchBlocks.BlockSvg.prototype.bwAddDebugMenu;
            if (style.parentNode) style.parentNode.removeChild(style);
            installed = false;
        }
    };
}
