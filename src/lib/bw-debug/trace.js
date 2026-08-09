/**
 * The execution trace — emu8051's history ring, which is the thing its TUI is
 * really built around.
 *
 * That TUI looks like eight independent panes and is not: `mainview.c` keeps one
 * ring buffer holding the PC and a full register snapshot per executed
 * instruction, and the disassembly, register, PSW, port and timer panes are five
 * *columns of the same table*, scrolled together. Reproducing it as five
 * separate widgets would lose the only property that makes it useful — that a
 * row of registers is the row belonging to that instruction.
 *
 * So this records rows, and the GUI renders them as one table. That is also the
 * one place where the GUI can be plainly better than the TUI: eight panes across
 * an 80-column terminal is a layout constraint, not a design.
 *
 * ## What a row costs, and what that means for "trace everything"
 *
 * A row is about thirty WASM calls. That is free when stepping and impossible at
 * a million instructions a second, which is exactly the TUI's own limit: it
 * records per instruction because its run loop single-steps, and at high speed
 * it cannot keep up either. Hence two modes, and the UI says which is on:
 *
 *   - **on halt** (default) — a row whenever the program stops. Cheap, always on.
 *   - **every instruction** — the runner single-steps and records each one.
 *     Truthful and slow, for when you are looking at a handful of instructions.
 *
 * A free run at speed records nothing in between, and the pane says so rather
 * than presenting a gap as a complete history.
 *
 * @module
 */

import { instructionLength } from './opcodes.js';

/** How many instructions to keep. emu8051's HISTORY_LINES is the same idea. */
const DEFAULT_CAPACITY = 512;

/** The SFRs the TUI's timer/serial pane shows, in its order. */
export const TIMER_SFRS = [
    { name: 'TMOD', addr: 0x89 }, { name: 'TCON', addr: 0x88 },
    { name: 'TH0', addr: 0x8C }, { name: 'TL0', addr: 0x8A },
    { name: 'TH1', addr: 0x8D }, { name: 'TL1', addr: 0x8B },
    { name: 'SCON', addr: 0x98 }, { name: 'PCON', addr: 0x87 }
];

/** The SFRs the TUI's I/O pane shows, in its order. */
export const IO_SFRS = [
    { name: 'SP', addr: 0x81 }, { name: 'P0', addr: 0x80 }, { name: 'P1', addr: 0x90 },
    { name: 'P2', addr: 0xA0 }, { name: 'P3', addr: 0xB0 },
    { name: 'IP', addr: 0xB8 }, { name: 'IE', addr: 0xA8 }
];

/**
 * A trace ring.
 *
 * @param {object} opts
 * @param {number} [opts.capacity]
 */
export function createTrace({ capacity = DEFAULT_CAPACITY } = {}) {
    /** @type {Array<object>} */
    let rows = [];
    let dropped = 0;
    let seq = 0;

    return {
        /**
         * Sample the target now and append a row.
         *
         * @param {object} target a DebugTarget
         * @param {string} why what caused this row: 'step' | 'halt' | 'trace'
         */
        record(target, why = 'halt') {
            const regs = target.regs();
            const pc = regs.pc;
            const len = instructionLength(target.readMem('code', pc, 1)[0]);
            const bytes = [...target.readMem('code', pc, len)];

            const row = {
                seq: seq++,
                why,
                pc,
                bytes,
                text: target.disasm ? target.disasm(pc) : '',
                a: regs.a,
                b: regs.b,
                r: regs.r,
                bank: regs.bank,
                dptr: regs.dptr,
                sp: regs.sp,
                psw: regs.psw,
                tNs: target.timeNs(),
                sfr: {}
            };
            // One read per SFR of interest rather than a 0x80..0xFF sweep: the
            // sweep is 128 calls a row and nothing renders the rest.
            for (const { name, addr } of [...IO_SFRS, ...TIMER_SFRS]) {
                row.sfr[name] = target.readMem('sfr', addr, 1)[0];
            }

            rows.push(row);
            if (rows.length > capacity) {
                dropped += rows.length - capacity;
                rows = rows.slice(-capacity);
            }
            return row;
        },

        /** Newest last, which is how the TUI scrolls. */
        rows: () => rows,
        /** How many rows fell off the end — shown, never silently discarded. */
        dropped: () => dropped,
        last: () => rows[rows.length - 1] || null,

        clear() { rows = []; dropped = 0; seq = 0; }
    };
}

/** `E5 82` → `"E5 82   "`, padded to three bytes as the TUI does. */
export function formatBytes(bytes) {
    const hex = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0'));
    while (hex.length < 3) hex.push('  ');
    return hex.join(' ');
}

/** `0x1F` → `"1F"`. */
export function hex8(v) {
    return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

/** `0x1F` → `"001F"`. */
export function hex16(v) {
    return (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}
