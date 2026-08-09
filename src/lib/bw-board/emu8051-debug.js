/**
 * emu8051-stc debug target — boundary D (DEBUG-CONTROL-MODEL.md §7).
 *
 * The sibling of emu8051-adapter.js: that one bridges the emulator to the BOARD
 * (boundary A, pins and time), this one bridges it to a DEBUGGER (run control,
 * breakpoints, memory, Level 1 position). They share a WASM instance and are
 * otherwise independent — a project can simulate without debugging, and the
 * conformance kit does exactly that.
 *
 * The WASM already implements all of it in C (`debug.c`, `wasm_api.c`). This
 * wrapper exists for three reasons, and the third is the important one:
 *
 *   1. shape — the C API is flat ints; the contract is objects and refusals.
 *   2. symbols — `(task, state)` is an index in the WASM and a NAME everywhere
 *      else, so somebody has to hold the mapping. That is the front end's
 *      symbol table, which arrives as JSON from stc_symtab.py.
 *   3. HONESTY — the C says yes to two things it does not really do, and a
 *      front end that believes it would mislead the user. Both are corrected
 *      here rather than passed through. See "Two corrections" below.
 *
 * ## Two corrections
 *
 * **`step('line')` is refused.** `dbg_step` returns success for every kind, and
 * its STEP_LINE branch is commented "Would need a line table. For now, treat as
 * step-insn." A line table is exactly what the WASM has no way to receive. So a
 * front end asking to step one C line would get one INSTRUCTION and no
 * indication of the difference — which is the failure DEBUG-CONTROL-MODEL §1
 * exists to prevent ("a target refuses by returning a reason, never by silently
 * doing something else"). `capabilities().steps` therefore omits `line`, and
 * calling it returns `{unsupported}`.
 *
 * **Watchpoints are refused.** `dbg_breakpoint` has BP_WRITE and BP_READ, but
 * no `emu_dbg_set_bp_write` is exported, so there is no way to reach them. They
 * are reported absent rather than accepted-and-ignored.
 *
 * ## No heap view — why memory is read a byte at a time
 *
 * Neither emu8051 build exposes `Module.HEAPU8` (checked against both the one
 * vendored in brickwright-lite and the current upstream build; the exported
 * runtime is `ccall cwrap addFunction removeFunction UTF8ToString
 * stringToUTF8` and nothing else). Every WASM entry point that hands JS a
 * POINTER is therefore unreachable — which is `emu_dbg_read_mem`, and the
 * `struct dbg_halt_reason *` the halt callback is given.
 *
 * So this wrapper uses only value-returning calls: `emu_get_code` /
 * `_iram` / `_sfr` / `_xdata` for reads, which compute exactly what
 * `dbg_read_mem` computes (same switch, same bounds — read them side by side),
 * and it reconstructs the halt reason from the accessors plus what it asked
 * for. The one thing genuinely lost is `bp_id`; it is recovered by matching the
 * halted PC against the breakpoints we set, and reported as absent when that is
 * ambiguous rather than guessed.
 *
 * Exporting HEAPU8 from the WASM build would let both go back to the direct
 * route. Until then this is not a workaround to be tidied away later — it is
 * the only thing that works against what actually ships.
 *
 * ## The budget-halt wart, absorbed
 *
 * `emu_dbg_run_until_ns` **halts the target when it runs out of budget** — and
 * `dbg_halt` fires the on-halt callback with HALT_USER. Run it once per
 * animation frame, as any real host must, and a UI subscribed to onHalt sees a
 * "halt" sixty times a second while the program is merrily running.
 *
 * `runFor()` therefore suppresses that callback and reports the outcome as a
 * return value instead: `'halted'` (a real stop the user should see) or
 * `'budget'` (this slice is over, call again). Nothing above this line ever
 * learns that the emulator technically stopped.
 *
 * @module
 */

/** Step kinds, in the order dbg_step_kind declares them. */
const STEP_KIND = { insn: 0, line: 1, block: 2, over: 3, out: 4 };

/** Address spaces, in the order dbg_space declares them. */
const SPACE = { code: 0, iram: 1, sfr: 2, xram: 3, bit: 4 };

/** DBG_MAX_BP in debug.h. Exceeding it returns -1, which we turn into a reason. */
const MAX_BREAKPOINTS = 32;

/**
 * @typedef {object} SymbolTable stc_symtab.py's output (format 004)
 * @property {number} [fosc]
 * @property {string} [device]
 * @property {{bw_ms: {addr: number}, tasks: Array<object>}} scheduler
 */

/**
 * Wrap a loaded emu8051-stc WASM module as a DebugTarget.
 *
 * @param {object} wasm the Emscripten module instance
 * @param {object} [opts]
 * @param {SymbolTable} [opts.symbols] load it now instead of calling setSymbols
 * @returns {object} the DebugTarget
 */
export function createEmu8051DebugTarget(wasm, opts = {}) {
    const need = [
        '_emu_dbg_state', '_emu_dbg_run', '_emu_dbg_halt', '_emu_dbg_step',
        '_emu_dbg_reset', '_emu_dbg_run_until_ns', '_emu_dbg_read_mem',
        '_emu_dbg_write_mem', '_emu_dbg_pc'
    ];
    const missing = need.filter((k) => typeof wasm[k] !== 'function');
    if (missing.length) {
        throw new Error(
            `this emu8051 build has no debug surface (missing ${missing.join(', ')}). ` +
            'It predates boundary D; re-vendor from a build that exports emu_dbg_*.'
        );
    }

    /** Task name -> the index the WASM knows it by. Empty until symbols arrive. */
    const taskIndex = new Map();
    /** "<task>/<state>" -> code address, for yield breakpoints. */
    const yieldAddr = new Map();
    /** Handle -> the Breakpoint it was set from, so we can describe a hit. */
    const breakpoints = new Map();

    let symbols = null;
    let listeners = [];
    /**
     * Set while runFor is inside emu_dbg_run_until_ns. Every halt that arrives
     * in that window is swallowed: the budget expiring is one of them and is
     * not a user-visible event, and the real ones are re-announced by runFor
     * from the return value, which is the only thing that distinguishes them
     * without the struct.
     */
    let inBudgetedRun = false;
    /**
     * Why we last asked the target to stop, so a halt can be described without
     * reading `cause` out of the unreachable struct. Null means nobody asked —
     * which, if the target stopped anyway, means a breakpoint.
     */
    let pendingCause = null;
    /** True between step() and the halt that ends it. */
    let stepping = false;
    let haltCbPtr = null;
    let detached = false;

    // ─── the halt callback ───────────────────────────────────────────────

    /**
     * Which breakpoint stopped us. `bp_id` lives in the struct we cannot read,
     * so match on the halted PC instead: a yield breakpoint is set AT its
     * address and a code breakpoint is the address. Ambiguity is reported as
     * "don't know" rather than resolved by picking one.
     */
    function breakpointAt(pc) {
        const hits = [...breakpoints.entries()].filter(([, bp]) => bp.pc === pc);
        return hits.length === 1 ? hits[0] : null;
    }

    function haltReason(cause) {
        const pc = wasm._emu_dbg_pc();
        const hit = cause === 'breakpoint' ? breakpointAt(pc) : null;
        return {
            cause,
            pc,
            bp: hit ? hit[0] : undefined,
            bpKind: hit ? hit[1].kind : undefined,
            tasks: positionOf(),
            tNs: nowNs(),
            // Zero, always, and not because nothing was measured: an emulator
            // halts time itself, so no wall clock ran on without it. The field
            // exists so a live chip can say otherwise (§7 decision 4).
            skewNs: 0n
        };
    }

    function announce(cause) {
        const why = haltReason(cause);
        for (const cb of listeners) cb(why);
        return why;
    }

    function onHaltFromWasm() {
        if (inBudgetedRun) return;      // runFor speaks for this window
        const cause = pendingCause || 'breakpoint';
        pendingCause = null;
        announce(cause);
    }

    if (wasm.addFunction && wasm._emu_dbg_set_on_halt) {
        // `void (*)(struct dbg_halt_reason *, void *)` — two pointers, no
        // return. Both are ignored: see the header on why the struct is
        // unreadable from JS.
        haltCbPtr = wasm.addFunction(onHaltFromWasm, 'vii');
        wasm._emu_dbg_set_on_halt(haltCbPtr);
    }

    function nowNs() {
        return (BigInt(wasm._emu_get_time_ns_hi() >>> 0) << 32n)
             | BigInt(wasm._emu_get_time_ns_lo() >>> 0);
    }

    /**
     * One byte out of one address space, using only value-returning calls.
     * Mirrors dbg_read_mem's switch exactly, including the bit-space derivation
     * (0x00–0x7F are the bits of IRAM 0x20–0x2F; 0x80 and up are the bits of the
     * SFRs at addresses divisible by 8).
     */
    function readByte(space, a) {
        switch (space) {
        case 'code': return wasm._emu_get_code(a);
        case 'iram': return wasm._emu_get_iram(a);
        case 'sfr':  return (a >= 0x80 && a <= 0xFF) ? wasm._emu_get_sfr(a) : 0;
        case 'xram': return wasm._emu_get_xdata(a);
        case 'bit': {
            const byte = a < 0x80
                ? wasm._emu_get_iram(0x20 + (a >> 3))
                : wasm._emu_get_sfr(a & 0xF8);
            return (byte >> (a & 7)) & 1;
        }
        default: return 0;
        }
    }

    // ─── Level 1 position ────────────────────────────────────────────────

    /**
     * Where every task is, per DEBUG-CONTROL-MODEL §2. Three RAM reads and no
     * instrumentation — which is why this works on silicon too.
     */
    function positionOf() {
        if (!symbols) return undefined;
        const out = [];
        for (const [name, idx] of taskIndex) {
            const state = wasm._emu_dbg_task_state(idx);
            const entry = { task: name, state };
            // 0xFFFF is "ran to the end", and a task that has finished is not
            // waiting for anything — reporting `until` there would invite a
            // front end to render a deadline that means nothing.
            if (state !== 0xFFFF) {
                const until = wasm._emu_dbg_task_until(idx);
                if (until) entry.until = until;
            }
            out.push(entry);
        }
        return out;
    }

    function loadSymbols(table) {
        symbols = table;
        taskIndex.clear();
        yieldAddr.clear();
        const sched = table && table.scheduler;
        if (!sched) return { tasks: 0, yields: 0 };

        if (sched.bw_ms && wasm._emu_dbg_set_bw_ms_addr) {
            wasm._emu_dbg_set_bw_ms_addr(sched.bw_ms.addr);
        }
        const tasks = sched.tasks || [];
        let yields = 0;
        tasks.forEach((task, i) => {
            if (i >= 8) return;           // wasm_tasks[8] in wasm_api.c
            taskIndex.set(task.name, i);
            wasm._emu_dbg_set_task(
                i,
                task.state ? task.state.addr : 0,
                task.until ? task.until.addr : 0
            );
            for (const y of task.yields || []) {
                if (typeof y.addr === 'number') {
                    yieldAddr.set(`${task.name}/${y.state}`, y.addr);
                    yields++;
                }
            }
        });
        if (tasks.length > 8) {
            // Say it rather than quietly debugging the first eight.
            return { tasks: 8, yields, dropped: tasks.length - 8 };
        }
        return { tasks: taskIndex.size, yields };
    }

    if (opts.symbols) loadSymbols(opts.symbols);

    // ─── the target ──────────────────────────────────────────────────────

    const target = {
        capabilities() {
            return {
                // `line` is absent on purpose — see "Two corrections" above.
                steps: ['insn', 'block', 'over', 'out'],
                breakpoints: ['code', 'yield'],
                spaces: ['code', 'iram', 'sfr', 'xram', 'bit'],
                writable: ['code', 'iram', 'sfr', 'xram', 'bit'],
                sfrs: 'all',
                haltPolicy: 'freeze-timers',
                timeFreezes: true,
                // An emulator takes nothing from the program: no timer, no
                // UART, no pin. The on-chip monitor is the one that has to
                // confess here (§7 decision 5).
                consumes: []
            };
        },

        state() {
            if (detached) return 'detached';
            return wasm._emu_dbg_state() === 1 ? 'running' : 'halted';
        },

        run() {
            stepping = false;
            pendingCause = null;
            wasm._emu_dbg_run();
        },

        halt() {
            pendingCause = 'user';
            wasm._emu_dbg_halt();
        },

        step(kind, count = 1) {
            if (kind === 'line') {
                return { unsupported:
                    'stepping one C line needs a line table, which this emulator has no ' +
                    'way to receive. Step one instruction, or one block.' };
            }
            const k = STEP_KIND[kind];
            if (k === undefined) return { unsupported: `no such step kind: ${kind}` };
            stepping = true;
            pendingCause = 'step';
            wasm._emu_dbg_step(k, count);
            return undefined;
        },

        reset() {
            stepping = false;
            pendingCause = null;
            wasm._emu_dbg_reset();
            // Breakpoints deliberately survive: `dbg_reset` resets the CPU and
            // the peripherals and does not touch `t->bps`, so the emulator will
            // still stop at them. Clearing our record here would leave the two
            // sides disagreeing and every later hit reported as "some
            // breakpoint, don't know which" — which is how this was written
            // first, and what the test now pins down. Restarting a program is
            // also not a reason to lose the breakpoints you set in it.
        },

        setBreakpoint(bp) {
            if (!bp || typeof bp !== 'object') return { unsupported: 'not a breakpoint' };
            if (breakpoints.size >= MAX_BREAKPOINTS) {
                return { unsupported:
                    `this emulator holds ${MAX_BREAKPOINTS} breakpoints and they are all in use` };
            }
            let handle;
            let pc;                       // where a hit will leave the PC
            if (bp.kind === 'code') {
                pc = bp.addr & 0xFFFF;
                handle = wasm._emu_dbg_set_bp_code(pc);
            } else if (bp.kind === 'yield') {
                const idx = taskIndex.get(bp.task);
                if (idx === undefined) {
                    return { unsupported: symbols
                        ? `no task named ${bp.task} in the symbol table`
                        : 'a yield breakpoint needs a symbol table; call setSymbols first' };
                }
                const addr = yieldAddr.get(`${bp.task}/${bp.state}`);
                if (addr === undefined) {
                    return { unsupported:
                        `the symbol table has no address for ${bp.task} state ${bp.state}` };
                }
                pc = addr;
                handle = wasm._emu_dbg_set_bp_yield(addr, idx, bp.state);
            } else if (bp.kind === 'write' || bp.kind === 'read') {
                return { unsupported:
                    'this build exposes no watchpoints. Poll the variable between blocks ' +
                    'instead — and label that as sampling, because it is.' };
            } else {
                return { unsupported: `no such breakpoint kind: ${bp.kind}` };
            }
            if (handle < 0) return { unsupported: 'the emulator refused the breakpoint' };
            breakpoints.set(handle, { ...bp, pc });
            return handle;
        },

        clearBreakpoint(handle) {
            wasm._emu_dbg_clear_bp(handle);
            breakpoints.delete(handle);
        },

        readMem(space, addr, len) {
            if (SPACE[space] === undefined) {
                return { unsupported: `no such address space: ${space}` };
            }
            const out = new Uint8Array(len);
            for (let i = 0; i < len; i++) out[i] = readByte(space, (addr + i) & 0xFFFF);
            return out;
        },

        writeMem(space, addr, data) {
            const s = SPACE[space];
            if (s === undefined) return { refused: `no such address space: ${space}` };
            // emu_dbg_write_mem takes one byte at a time.
            for (let i = 0; i < data.length; i++) {
                wasm._emu_dbg_write_mem(s, (addr + i) & 0xFFFF, data[i]);
            }
            return undefined;
        },

        regs() {
            const psw = wasm._emu_dbg_psw();
            return {
                pc: wasm._emu_dbg_pc(),
                a: wasm._emu_dbg_acc(),
                b: wasm._emu_dbg_b(),
                dptr: wasm._emu_dbg_dptr(),
                sp: wasm._emu_dbg_sp(),
                psw,
                // Reported, not left for the front end to derive from PSW —
                // §6 says a conforming target states the bank explicitly.
                bank: (psw >> 3) & 3,
                r: Array.from({ length: 8 }, (_, n) => wasm._emu_dbg_rn(n))
            };
        },

        onHalt(cb) {
            listeners.push(cb);
            return () => { listeners = listeners.filter((f) => f !== cb); };
        },

        // ─── beyond the interface ────────────────────────────────────────

        /** Load stc_symtab.py's JSON. Needed for position and yield breakpoints. */
        setSymbols: loadSymbols,

        /** Level 1 position right now, or undefined without a symbol table. */
        position: positionOf,

        /** The scheduler's millisecond tick, or undefined without symbols. */
        bwMs() {
            return symbols && wasm._emu_dbg_bw_ms ? wasm._emu_dbg_bw_ms() : undefined;
        },

        /** Program time in nanoseconds since reset. */
        timeNs: nowNs,

        /**
         * The instruction at `addr`, as text.
         *
         * `emu_disasm` returns a `const char *`, which is a pointer — normally
         * out of reach here (see the header). `ccall` with a 'string' return
         * marshals it using Emscripten's own heap access, which is exported.
         * It does NOT report the instruction's length; a caller that needs to
         * walk forward gets that from an opcode table.
         */
        disasm(addr) {
            if (!wasm.ccall || !wasm._emu_disasm) return '';
            try {
                return wasm.ccall('emu_disasm', 'string', ['number'], [addr & 0xFFFF]) || '';
            } catch {
                return '';
            }
        },

        /**
         * Move the program counter. `g` in the TUI.
         *
         * Refused rather than silently ignored when the build predates it —
         * jumping the PC and having nothing happen is worse than being told.
         */
        setPc(addr) {
            if (!wasm._emu_set_pc) return { refused: 'this emulator build cannot set the PC' };
            wasm._emu_set_pc(addr & 0xFFFF);
            return undefined;
        },

        /** Clear RAM as well as the registers — the TUI's W)ipe, vs its R)eset. */
        wipe() {
            if (wasm._emu_reset) wasm._emu_reset(1);
            else wasm._emu_dbg_reset();
        },

        /**
         * Run at most `budgetNs` of PROGRAM time, or until the target halts.
         *
         * The primitive a host's frame loop is built from. Returns:
         *   'halted' — a breakpoint or a completed step. Listeners have fired.
         *   'budget' — the slice is used up and nothing happened. Call again.
         *   'idle'   — the target was not running to begin with.
         *
         * Never leaves a spurious halt visible to onHalt listeners, and always
         * leaves the target running when it returns 'budget', so a caller does
         * not have to know that the C halts on budget expiry.
         */
        runFor(budgetNs) {
            if (detached) return 'idle';
            if (wasm._emu_dbg_state() !== 1) return 'idle';
            const until = target.timeNs() + BigInt(budgetNs);
            const lo = Number(until & 0xFFFFFFFFn);
            const hi = Number((until >> 32n) & 0xFFFFFFFFn);

            const wasStepping = stepping;
            inBudgetedRun = true;
            let stopped;
            try {
                stopped = wasm._emu_dbg_run_until_ns(lo, hi) === 1;
            } finally {
                inBudgetedRun = false;
            }

            if (stopped) {
                // The return value is what separates a real stop from the
                // budget one, so it — not the swallowed callback — decides
                // what the listeners hear.
                stepping = false;
                announce(wasStepping ? 'step' : 'breakpoint');
                return 'halted';
            }

            // Budget expiry left the target halted. Put it back the way the
            // caller believes it is, so `state()` does not flicker to 'halted'
            // between frames of a run the user thinks is continuous.
            wasm._emu_dbg_run();
            return 'budget';
        },

        /** The link is gone. Only the live target can really detach; here it is for tests. */
        detach() { detached = true; },

        /** Release the registered callback. */
        destroy() {
            if (haltCbPtr !== null && wasm.removeFunction) {
                try { wasm.removeFunction(haltCbPtr); } catch { /* already gone */ }
            }
            haltCbPtr = null;
            listeners = [];
        }
    };

    return target;
}
