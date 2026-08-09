/**
 * The debug runner — everything between "a project" and "a glowing block".
 *
 * Design: `sb3-creator/reference/debugger-ui.md`. This is the host side of it:
 * bw-board owns the target and the session (both framework-free and tested in
 * Node), and this file owns the four things only a browser can do — build the
 * image over the network, instantiate the WASM, drive a frame loop, and light
 * up a block in the editor.
 *
 *     project  --generateC({debug:true})-->  C + @bw yield map
 *              --POST /compile{symbols}-->   .hex + symbol table
 *              --emu8051 + bw-board------->  a running, breakable program
 *              --why.tasks + yields[].block->  vm.runtime.glowBlock
 *
 * ## Why the symbol table has to come from the server
 *
 * A browser cannot run SDCC and cannot run stc_symtab.py, and the yield map
 * alone is not enough: it says WHICH BLOCK each `(task, state)` is, but not
 * where `<task>_state` lives in RAM or what code address a yield sits at. Only
 * the linker knows that. So `POST /compile {"symbols": true}` returns both, and
 * the two are joined here — by `(task, state)`, which is the one key that
 * survives the whole chain.
 *
 * ## Debug builds are not release builds, twice over
 *
 * `generateC({debug: true})` forces the cooperative scheduler even for a single
 * script (straight-line code in `main()` has no position to report), and
 * `--debug` makes SDCC stop tail-merging returns so line records map cleanly —
 * measured at 8 of 39 hex records different on a two-task program. The program
 * behaves the same; it is not the same bytes. So the image and the symbol table
 * must always come from the SAME request, and a debug image is never the thing
 * to flash.
 *
 * @module
 */

import {
    listBreakpoints, subscribeBreakpoints, toggleBreakpoint,
    setCondition, conditionOf, allConditions
} from './breakpoints.js';
import { parseCondition } from './condition.js';
import { createTrace, IO_SFRS, TIMER_SFRS } from './trace.js';
import { setValueResolver } from './hover-values.js';
import { instructionLength } from './opcodes.js';

/**
 * How many suppressed breakpoint hits one frame will absorb before yielding to
 * the browser. A yield breakpoint on a `wait` re-fires every pass of the
 * dispatch loop, so this is routinely in the thousands.
 */
const SKIP_BUDGET = 20000;

/**
 * @param {object} opts
 * @param {object} opts.vm the scratch-vm instance (for toJSON and glowBlock)
 * @param {string} [opts.compilerUrl] the stc-compiler service
 * @param {(state: object) => void} [opts.onChange] UI state changed
 */
export function createDebugRunner({ vm, compilerUrl = 'https://stc-compiler.vercel.app', onChange = () => {} }) {
    let session = null;
    let target = null;
    let board = null;
    let symbols = null;
    /** `${task}/${state}` -> block id, joined from the two halves. */
    let blockOf = new Map();
    /** block id -> `${task}/${state}`, for setting a breakpoint by block. */
    let yieldOf = new Map();
    /** Block ids currently lit. Several, because several tasks are somewhere. */
    let glowing = new Set();
    let rafId = null;
    let status = { phase: 'idle', message: '' };
    /**
     * block id -> the target's handle. Mirrors the shared store (breakpoints.js),
     * which is where the USER's breakpoints live: they are set by right-clicking a
     * block long before a target exists, and they outlive every stop.
     */
    const bps = new Map();
    let unsubscribeBps = null;
    /** The execution history the drawer renders. See trace.js. */
    const trace = createTrace();
    /** The user's own variables: {name, space, addr, size}. From the symbol table. */
    let variableTable = [];
    /** The project's declared pins, for the physical view. */
    let pinTable = [];
    /** Conditions that failed to parse, surfaced rather than silently ignored. */
    let conditionErrors = {};
    /** How many conditional hits were skipped, so the UI can show it happened. */
    let skipped = 0;
    /** Set by the halt handler when a stop should not be shown; read by pumpFrame. */
    let skipRequested = false;
    /** Address breakpoints, which the drawer sets by number rather than by block. */
    const addrBps = new Map();

    function setStatus(phase, message = '') {
        status = { phase, message };
        emit();
    }

    /**
     * What the UI renders.
     *
     * `phase` is DERIVED from the session whenever there is one, never stored
     * alongside it. Keeping a second copy here was the first version, and it
     * drifted immediately: a breakpoint halt reached the session but the
     * runner still said "running", so the panel showed a running program that
     * was not moving. `status.phase` now only covers the states the session
     * cannot know about — before it exists, and when the build failed.
     */
    function snapshot() {
        const sess = session ? session.state() : null;
        let phase = status.phase;
        if (sess && phase !== 'error') {
            phase = sess.intent === 'paused' ? 'paused'
                : sess.intent === 'running' ? (sess.stepping ? 'stepping' : 'running')
                    : 'idle';
        }
        return {
            phase,
            message: status.message,
            session: sess,
            capabilities: target ? target.capabilities() : null,
            breakpoints: listBreakpoints(),
            /** Marked blocks the current build has no yield point for. */
            unreachableBreakpoints: listBreakpoints().filter((id) => yieldOf.size && !yieldOf.has(id)),
            conditions: allConditions(),
            conditionErrors,
            skippedHits: skipped,
            /** block id -> `wait` / `forever` / … so a list can name them, not hash them. */
            yieldKinds: Object.fromEntries(
                [...yieldOf].map(([id, y]) => [id, y.kind])
            ),
            glowing: [...glowing],
            yieldBlocks: [...yieldOf.keys()]
        };
    }

    function emit() {
        onChange(snapshot());
    }

    // ─── glow ────────────────────────────────────────────────────────────

    /**
     * Light up the block the program is sitting on.
     *
     * Level 1 is yield-to-yield, so this marks the block whose yield we are AT,
     * not necessarily the statement about to run — `debugger-ui.md` §2.2. The
     * UI must not imply more precision than that.
     */
    function glow(tasks) {
        // EVERY task, not one. A cooperative scheduler really does have several
        // scripts each sitting somewhere, and Scratch itself glows every running
        // script rather than choosing between them. Picking "the first task that
        // resolves" was the first version of this, and it lit the other script's
        // hat when a breakpoint stopped task 1 — confidently pointing at the
        // wrong block, which is worse than pointing at none.
        // A finished task (state 0xFFFF) has no block and simply drops out.
        const next = new Set(
            (tasks || [])
                .map((t) => blockOf.get(`${t.task}/${t.state}`))
                .filter(Boolean)
        );
        for (const id of glowing) if (!next.has(id)) safeGlow(id, false);
        for (const id of next) if (!glowing.has(id)) safeGlow(id, true);
        glowing = next;
    }

    function clearGlow() {
        for (const id of glowing) safeGlow(id, false);
        glowing = new Set();
    }

    function safeGlow(blockId, on) {
        try {
            vm.runtime.glowBlock(blockId, on);
        } catch {
            // A block id from a stale build is not worth throwing over; the
            // worst case is a block that does not light up.
        }
    }

    // ─── build ───────────────────────────────────────────────────────────

    /**
     * The project's own hardware declarations.
     *
     * NOT from `vm.toJSON().stc`, which is always undefined: scratch-vm's sb3
     * serializer emits targets/monitors/extensions/meta and drops every other
     * top-level key, so the `stc` block SB3Creator writes into the .sb3 never
     * comes back out. The runtime keeps it instead. Reading the serialised copy
     * is why the circuit designer opened empty for every project, and it would
     * have sent every debug build to the HOST C target — `generateC` picks
     * device-vs-host on `project.stc.pins`, so a missing table does not fail
     * loudly, it silently compiles a different program.
     */
    function projectStc(project) {
        if (vm && vm.runtime && vm.runtime.stc) return vm.runtime.stc;
        return (project && project.stc) || null;
    }

    /** The project as the emitter needs it: serialised, with the runtime's stc put back. */
    function projectForEmit() {
        const project = JSON.parse(vm.toJSON());
        const stc = projectStc(project);
        if (stc) project.stc = stc;
        return project;
    }

    /**
     * blocks -> C -> .hex + symbol table. Returns everything the attach step
     * needs, or throws with a message meant to be shown to a person.
     */
    async function build() {
        setStatus('building', 'reading the project…');
        const project = projectForEmit();
        const stc = project.stc;
        if (!stc || !(stc.pins || []).length) {
            throw new Error(
                'This project declares no pins, so there is no hardware to debug. ' +
                'Add DEVICE / PIN declarations in the Code tab first.'
            );
        }

        const { default: SB3Creator } = await import(
            /* webpackChunkName: "sb3-creator" */ '../sb3-creator.js');
        const { readYieldMap } = await import(
            /* webpackChunkName: "sb3-creator-c" */ '../sb3-creator-c.js');

        const creator = new SB3Creator();
        const c = creator.generateC(project, { debug: true });
        const yields = readYieldMap(c);
        if (!yields.length) {
            throw new Error(
                'This project has no green-flag script, so there is nothing to run.'
            );
        }

        setStatus('building', 'compiling…');
        const res = await fetch(`${compilerUrl}/compile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: c,
                language: 'c',
                target: (stc.device || 'stc12c5a60s2').toLowerCase(),
                format: 'ihx',
                // Both, from the SAME request — see the header.
                symbols: true
            })
        });
        const out = await res.json();
        if (!out.success) throw new Error(out.error || 'the compiler refused this program');
        if (!out.symbols) {
            throw new Error(
                `the image built but carries no symbol table, so the debugger cannot ` +
                `say where it is: ${out.symbols_error || 'no reason given'}`
            );
        }

        // The join. The emitter knows (task, state) -> block; the linker knows
        // (task, state) -> address. Neither knows the other, and (task, state)
        // is the only key both speak.
        blockOf = new Map();
        yieldOf = new Map();
        for (const y of yields) {
            blockOf.set(`${y.task}/${y.state}`, y.block);
            // A block can hold only one yield, so this direction is 1:1.
            yieldOf.set(y.block, { task: y.task, state: y.state, kind: y.kind });
        }

        return { hex: atob(out.base64), symbols: out.symbols, c, bytes: out.bytes };
    }

    // ─── attach ──────────────────────────────────────────────────────────

    async function attach(built) {
        setStatus('attaching', 'starting the emulator…');
        const [{ createEmu8051DebugTarget, createDebugSession, createEmu8051Adapter,
            BoardImpl, inferNetlist }, createEmu8051] = await Promise.all([
            import(/* webpackChunkName: "bw-board" */ '../bw-board/index.js'),
            import(/* webpackChunkName: "emu8051" */ '../emu8051/emu8051.js').then((m) => m.default || m)
        ]);

        // Emscripten resolves the .wasm relative to the script that loaded it,
        // which for a lazy chunk is `chunks/` — where the file is not. Webpack
        // copies it to `static/` (see the CopyWebpackPlugin entry), and
        // document.baseURI keeps this correct under GitHub Pages, where the app
        // is served from a subpath rather than the root.
        const wasm = await createEmu8051({
            locateFile: (file) => new URL(`static/${file}`, document.baseURI).href
        });
        const stc = projectStc(null);
        const fosc = Number(stc.clock) || 11059200;

        // ORDER MATTERS, and getting it wrong fails silently.
        //
        // `emu_init` frees and re-callocs code memory and re-runs dbg_init. The
        // adapter's constructor calls it. So the adapter must come BEFORE the
        // image, or the image is wiped — and the symptom is not an error: the
        // CPU NOP-sleds through 64 KB of zeroes, reaches whatever address a
        // breakpoint sits at, and halts there with every task still at state 0.
        // It looks like a working debugger pointing at the wrong block. The
        // assertion below is what makes it loud instead.
        //
        //   1. adapter  — inits the emulator, sets the clock and Vcc
        //   2. board    — attached before anything runs, so no edge is missed
        //   3. image    — after the last emu_init
        //   4. target   — symbols last; nothing may re-init behind it
        const adapter = createEmu8051Adapter(wasm, { fosc });

        // The board, so the LEDs light and the buzzer sounds while debugging.
        // It is driven by the emulator through boundary A and knows nothing
        // about the debugger: a halted MCU simply stops calling advanceTo.
        const { parts, nets } = inferNetlist(stc);
        board = new BoardImpl();
        board.setNetlist(parts, nets);
        board.setPower(true);
        adapter.attachBoard(board);

        // ccall marshals the string itself. Nothing here may touch a heap view:
        // no emu8051 build exports one (debugger-ui.md §7b).
        wasm.ccall('emu_load_hex', 'number', ['string', 'number'],
            [built.hex, built.hex.length]);

        // A real 8051 image begins with a jump over the interrupt vectors, so
        // all-zero code at the reset vector means nothing was loaded.
        if (!wasm._emu_get_code(0) && !wasm._emu_get_code(1) && !wasm._emu_get_code(2)) {
            throw new Error(
                'the image did not reach the emulator — code memory is empty at the ' +
                'reset vector. Something re-initialised the emulator after the load.'
            );
        }

        // The block editor asks for hover values through this, because the
        // workspace and the runner are in different component trees.
        setValueResolver((blockId) => runner.valuesAtBlock(blockId));
        symbols = built.symbols;
        variableTable = (symbols.variables || []).filter((v) => v.space);
        pinTable = stc.pins || [];
        target = createEmu8051DebugTarget(wasm, { symbols });
        session = createDebugSession(target, {
            onChange: (st) => {
                if (st.halted) {
                    // A conditional pause point whose condition is false is not
                    // a stop at all: resume before anything observes it, so the
                    // glow does not flicker, the trace is not polluted with
                    // hits the user asked not to see, and the UI never shows a
                    // pause that immediately un-pauses.
                    // Not resumed here: the frame loop does it, so that many
                    // skips can be absorbed inside ONE frame. Resuming from
                    // here cost a whole frame per skipped hit, and since a
                    // yield breakpoint re-fires within microseconds the program
                    // advanced by microseconds per frame — 1765 skips and the
                    // wait had barely started.
                    if (shouldSkip(st)) { skipped++; skipRequested = true; return; }
                    glow(st.tasks);
                    // One row per stop, always. The drawer's trace pane is the
                    // TUI's history ring; this is the cheap half of filling it.
                    trace.record(target, st.why ? st.why.cause : 'halt',
                        { variables: runner.variables(), tasks: st.tasks });
                } else clearGlow();
                emit();
            }
        });

        setStatus('ready', `${built.bytes} bytes, ${blockOf.size} yield points`);
        return session;
    }

    /**
     * Should this halt be swallowed?
     *
     * Only for a breakpoint hit on a block carrying a condition that evaluates
     * false. Everything else — a step, a pause, an unconditional breakpoint, a
     * condition that will not parse — stops. Erring towards stopping is
     * deliberate: a pause point that silently never fires looks exactly like a
     * broken debugger, while one that fires too often is merely annoying and
     * is visibly the user's own condition.
     */
    function shouldSkip(st) {
        const why = st.why;
        if (!why || why.cause !== 'breakpoint' || why.bp === undefined) return false;

        // A yield breakpoint is a code address at a `case` label, and the
        // scheduler re-enters that label on EVERY pass of the dispatch loop
        // while the task sits in it. A pause point on a `wait 0.3 seconds`
        // therefore fires thousands of times during that one wait — measured
        // at 1749 hits before this — so "resume" appears to do nothing and a
        // condition never gets the chance to become true.
        //
        // The task itself already knows the difference: while it is waiting,
        // `<task>_until` is in the future, and the C's own test is a
        // wraparound-safe 16-bit compare. Reuse it. One stop per visit, on the
        // pass where the wait is over — which is also the moment the user means
        // by "pause here".
        if (stillWaiting(why)) return true;

        const blockId = [...bps].find(([, handle]) => handle === why.bp)?.[0];
        if (!blockId) return false;
        const source = conditionOf(blockId);
        if (!source) return false;
        const parsed = parseCondition(source);
        if (parsed.error) return false;          // reported in the snapshot, and it stops
        const vars = Object.fromEntries(runner.variables().map((v) => [v.name, v.value]));
        try {
            return !parsed.test(vars);
        } catch {
            return false;                        // never let a condition trap the debugger
        }
    }

    /**
     * Is the task we stopped in still counting down a wait?
     *
     * Mirrors the generated C exactly: `(int)(bw_now() - <task>_until) < 0`,
     * a 16-bit wraparound-safe compare. A task with no deadline (`until`
     * absent, which is how the target reports a task that is not waiting or
     * has finished) is never "still waiting".
     */
    function stillWaiting(why) {
        if (!target || !why || !why.tasks) return false;
        const ms = target.bwMs();
        if (ms === undefined) return false;
        for (const t of why.tasks) {
            if (t.until === undefined) continue;
            const delta = (ms - t.until) & 0xFFFF;
            const signed = delta > 0x7FFF ? delta - 0x10000 : delta;
            if (signed < 0) return true;
        }
        return false;
    }

    // ─── the frame loop ──────────────────────────────────────────────────

    function pumpFrame() {
        rafId = null;
        if (!session) return;
        let outcome = session.pump();

        // Absorb skipped hits in this frame rather than one per frame. Bounded,
        // because a pause point inside a tight loop with a condition that never
        // becomes true would otherwise never hand the browser back: at the cap
        // we simply return and try again next frame, which is slow but alive.
        for (let n = 0; skipRequested && n < SKIP_BUDGET; n++) {
            skipRequested = false;
            session.resume();
            outcome = session.pump();
        }
        if (skipRequested) { skipRequested = false; session.resume(); schedule(); return; }
        // Boundary A's clock. The emulator pushes PIN CHANGES to the board by
        // itself (emu_set_board_callbacks), but nothing pushes TIME: the debug
        // run path never calls on_advance, and the board integrates time to get
        // LED brightness and buzzer frequency. Without this the pins toggle
        // correctly and the LED never changes, which looks like a dead board.
        //
        // Doing it HERE, only when the pump actually ran, is also what makes
        // DEBUG-CONTROL-MODEL §3.1 fall out for free: a halted MCU stops
        // pumping, so board time stops with program time, and resume continues
        // from where it stopped rather than catching up on wall-clock.
        if (board && outcome !== 'idle') board.advanceTo(target.timeNs());
        // Keep going while there is anything to do. A halted session stops
        // asking for frames entirely, which is what makes a paused program cost
        // nothing rather than spin.
        if (outcome === 'ran') schedule();
        emit();
    }

    function schedule() {
        if (rafId === null && typeof requestAnimationFrame === 'function') {
            rafId = requestAnimationFrame(pumpFrame);
        }
    }

    function unschedule() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    // ─── the verbs ───────────────────────────────────────────────────────

    const runner = {
        state: snapshot,

        /** Build, attach, and run. The ⚑ of the debug world. */
        async start() {
            try {
                if (!session) {
                    const built = await build();
                    await attach(built);
                    // The user's breakpoints only became SETTABLE now: until a
                    // target exists there is nothing to set them on, and until
                    // this build exists nothing knows which (task, state) a
                    // block is. Subscribing rather than reading once keeps a
                    // right-click during a run working.
                    unsubscribeBps = subscribeBreakpoints(syncBreakpoints);
                }
                session.start();
                setStatus('running');
                schedule();
            } catch (e) {
                unschedule();
                setStatus('error', e.message);
            }
        },

        pause() {
            if (!session) return;
            session.pause();
            unschedule();
            setStatus('paused');
        },

        resume() {
            if (!session) return;
            session.resume();
            setStatus('running');
            schedule();
        },

        /** One block by default — the granularity every target supports. */
        step(kind = 'block') {
            if (!session) return { unsupported: 'nothing is running yet' };
            const refusal = session.step(kind);
            if (refusal) { setStatus('paused', refusal.unsupported); return refusal; }
            setStatus('stepping');
            schedule();
            return undefined;
        },

        stop() {
            unschedule();
            if (session) session.stop();
            clearGlow();
            setStatus('idle');
        },

        setSpeed(x) { if (session) session.setSpeed(x); },

        /**
         * Is this block a place the program can be stopped at?
         *
         * The user cannot see which blocks are yield points, so a UI should ask
         * before offering "Pause here" — and where the answer is no, snap to
         * the next one rather than refusing (debugger-ui.md §3).
         */
        isYieldBlock: (blockId) => yieldOf.has(blockId),

        /** What a halt at this block would be called: `wait`, `forever`, … */
        yieldKind: (blockId) => (yieldOf.get(blockId) || {}).kind,

        /**
         * Mark or unmark a block. Delegates to the shared store, so the change
         * is visible to the editor's context menu and survives a stop — the
         * subscription above pushes it into the target when there is one.
         */
        toggleBreakpoint(blockId) {
            const now = toggleBreakpoint(blockId);
            emit();
            return now;
        },

        /**
         * "Pause here when counter > 10".
         *
         * Validated on the way in, so a typo is reported where it was typed
         * rather than becoming a pause point that mysteriously never fires.
         * Returns the parse error, or undefined on success.
         */
        setCondition(blockId, source) {
            if (source) {
                const parsed = parseCondition(source);
                if (parsed.error) {
                    conditionErrors = { ...conditionErrors, [blockId]: parsed.error };
                    emit();
                    return { error: parsed.error };
                }
                // A name the build does not have is not fatal — the variable may
                // appear after an edit — but it IS worth saying, because the
                // commonest condition that never fires is a misspelt name.
                const known = new Set(runner.variables().map((v) => v.name));
                const unknown = parsed.names.filter((n) => !known.has(n));
                conditionErrors = { ...conditionErrors };
                delete conditionErrors[blockId];
                if (unknown.length && known.size) {
                    conditionErrors[blockId] = `no variable named ${unknown.join(', ')}`;
                }
            } else {
                conditionErrors = { ...conditionErrors };
                delete conditionErrors[blockId];
            }
            setCondition(blockId, source);
            emit();
            return undefined;
        },

        conditionOf,

        // ─── the engineer's view ─────────────────────────────────────
        //
        // Everything below exists so the drawer can show what emu8051's TUI
        // shows. It is deliberately a thin pass-through: the target already
        // implements boundary D, and a second layer of interpretation here
        // would be a second place for the two to disagree.

        /** Registers, the SFRs the TUI names, and the stack — one sample. */
        inspect() {
            if (!target) return null;
            const regs = target.regs();
            const sfr = {};
            for (const { name, addr } of [...IO_SFRS, ...TIMER_SFRS]) {
                sfr[name] = target.readMem('sfr', addr, 1)[0];
            }
            // The stack grows UP on an 8051 and SP points at the last byte
            // pushed, so the live entries are 0x08..SP — 0x07 is where SP sits
            // after a reset, below the first push.
            const stack = [];
            for (let a = 0x08; a <= regs.sp && a <= 0xFF; a++) {
                stack.push({ addr: a, value: target.readMem('iram', a, 1)[0] });
            }
            return { regs, sfr, stack, pc: regs.pc, tNs: target.timeNs() };
        },

        /** Raw bytes, for the hex view. Returns [] rather than throwing. */
        readMem(space, addr, len) {
            if (!target) return [];
            const out = target.readMem(space, addr, len);
            return out instanceof Uint8Array ? [...out] : [];
        },

        /** Edit one byte. `code` is writable here, as it is in the TUI. */
        writeMem(space, addr, value) {
            if (!target) return { refused: 'nothing is loaded' };
            return target.writeMem(space, addr, Uint8Array.from([value & 0xFF]));
        },

        /** The instruction at an address, as text. */
        disasm(addr) { return target ? target.disasm(addr) : ''; },

        /**
         * A short listing from `addr`, walking with the opcode length table.
         * The TUI has no such pane — its code window is the trace — but a
         * listing around the PC is what a GUI reader expects, and the length
         * table makes it free.
         */
        listing(addr, count = 16) {
            if (!target) return [];
            const rows = [];
            let a = addr & 0xFFFF;
            for (let i = 0; i < count; i++) {
                const opcode = target.readMem('code', a, 1)[0];
                const len = instructionLength(opcode);
                rows.push({
                    addr: a,
                    bytes: [...target.readMem('code', a, len)],
                    text: target.disasm(a)
                });
                a = (a + len) & 0xFFFF;
            }
            return rows;
        },

        /** Move the PC. The TUI's `g`. */
        setPc(addr) { return target ? target.setPc(addr) : { refused: 'nothing is loaded' }; },

        /** Reset registers only, or reset and clear RAM. The TUI's R) and W). */
        resetCpu() { if (target) { target.reset(); trace.record(target, 'reset', {variables: runner.variables()}); emit(); } },
        wipe() { if (target) { target.wipe(); trace.record(target, 'reset', {variables: runner.variables()}); emit(); } },

        /** A breakpoint at a code ADDRESS, which blocks cannot express. */
        addressBreakpoints: () => [...addrBps.keys()],
        toggleAddressBreakpoint(addr) {
            if (!target) return false;
            const a = addr & 0xFFFF;
            if (addrBps.has(a)) {
                target.clearBreakpoint(addrBps.get(a));
                addrBps.delete(a);
            } else {
                const handle = target.setBreakpoint({ kind: 'code', addr: a });
                if (typeof handle !== 'number') return false;
                addrBps.set(a, handle);
            }
            emit();
            return addrBps.has(a);
        },

        /** The execution history. Newest last. */
        trace: () => trace.rows(),
        traceDropped: () => trace.dropped(),
        clearTrace() { trace.clear(); emit(); },

        /**
         * One instruction, synchronously. The TUI's space bar.
         *
         * Each step ends in a halt, and the halt handler records a trace row —
         * so stepping IS how an instruction-by-instruction trace gets built,
         * and nothing extra is recorded here. An earlier version recorded again
         * from this loop and produced two rows per step.
         *
         * A free run does NOT trace every instruction, and cannot: a row is
         * about thirty WASM calls, against eleven million instructions a second.
         * emu8051's TUI has the same limit from the other side — it records per
         * instruction because its loop single-steps, and at speed it stops
         * keeping up too. The trace pane says which it is showing rather than
         * presenting the gap as a complete history.
         */
        stepInstruction(count = 1) {
            if (!target) return { unsupported: 'nothing is running yet' };
            for (let i = 0; i < count; i++) {
                const refusal = target.step('insn', 1);
                if (refusal) return refusal;
                // Pump until the step lands. One instruction is a handful of
                // cycles, so this is bounded and fast.
                for (let n = 0; n < 4096 && target.state() === 'running'; n++) {
                    target.runFor(1000);
                }
            }
            emit();
            return undefined;
        },

        /** `over` and `out`, which the target defines in terms of SP. */
        stepOver() { return session ? session.step('over') : { unsupported: 'not running' }; },
        stepOut() { return session ? session.step('out') : { unsupported: 'not running' }; },

        /**
         * The user's OWN variables, by the name they typed.
         *
         * This is the pane a debugger for this audience should lead with. Not
         * A/B/DPTR — `counter`, with the value in it. Every one is a 16-bit
         * signed int because that is what generateC emits, and SDCC stores
         * them little-endian.
         */
        variables() {
            if (!target) return [];
            return variableTable.map((v) => {
                const bytes = target.readMem(v.space, v.addr, 2);
                const raw = (bytes[1] << 8) | bytes[0];
                return {
                    name: v.name,
                    sprite: v.sprite || null,
                    // Scratch's numbers are signed; 0xFFFF is -1, not 65535.
                    value: raw > 0x7FFF ? raw - 0x10000 : raw,
                    where: `${v.space} 0x${v.addr.toString(16).toUpperCase()}`
                };
            });
        },

        /**
         * Each declared pin as a PHYSICAL fact, not a register bit.
         *
         * The board is the authority: it knows the resolved level and what is
         * wired there, and it already applies the active-low inversion. An
         * ANALOG pin reports volts, because that is what the part does — the
         * conversion to counts is the MCU's business (boundary A).
         */
        pins() {
            if (!board) return [];
            return pinTable.map((p) => {
                const id = `P${p.port}.${p.bit}`;
                const out = { name: p.name, pin: id, direction: p.direction,
                    activeLow: !!p.activeLow };
                try {
                    if (p.direction === 'analog') {
                        out.volts = board.readAnalog(id);
                    } else {
                        const level = board.readPin(id);
                        out.level = level;
                        // What the USER called it: an active-low LED driven
                        // low is ON, and saying "0" here would teach the
                        // opposite of the thing this board exists to teach.
                        out.on = p.activeLow ? level === 0 : level === 1;
                    }
                } catch { /* a pin with nothing wired to it has no reading */ }
                return out;
            });
        },

        /** LED brightnesses by part id, so the panel can show them lit. */
        leds() {
            if (!board) return [];
            return board.getLeds().map((id) => ({ id, brightness: board.ledBrightness(id) }));
        },

        /**
         * What the program looked like the last time it was AT this block.
         *
         * The debugger's answer to "what was `counter` here?", which is the
         * question a learner actually has and the one a live-values pane
         * cannot answer: by the time you look, the program has moved on.
         * Every recorded stop already carries a full variable snapshot and the
         * position it was taken at, so this is a lookup, not new machinery.
         *
         * Returns null when this block has never been stopped at — which is
         * the honest answer, and different from "all its variables were zero".
         *
         * @param {string} blockId
         * @returns {{variables: Array, tNs: bigint, agoMs: number, why: string} | null}
         */
        valuesAtBlock(blockId) {
            const y = yieldOf.get(blockId);
            if (!y) return null;
            const rows = trace.rows();
            for (let i = rows.length - 1; i >= 0; i--) {
                const row = rows[i];
                if (!row.variables || !row.tasks) continue;
                // The row was taken while this task sat in this state — which
                // is exactly "the program was at this block".
                const here = row.tasks.some((t) => t.task === y.task && t.state === y.state);
                if (!here) continue;
                const now = target ? target.timeNs() : row.tNs;
                return {
                    variables: row.variables,
                    tNs: row.tNs,
                    // Clamped: when the program is paused AT this block, now
                    // and the row are the same instant, and `-0 ms ago` is a
                    // JS artefact rather than a fact about the program.
                    agoMs: Math.max(0, Number(now - row.tNs) / 1e6),
                    why: row.why,
                    kind: y.kind
                };
            }
            return null;
        },

        /** Program time, in ms, or null before anything has run. */
        timeMs: () => (target ? Number(target.timeNs()) / 1e6 : null),

        /** The board, so a circuit panel can render what the program is doing. */
        board: () => board,

        symbols: () => symbols,

        destroy() {
            setValueResolver(null);
            unschedule();
            if (unsubscribeBps) { unsubscribeBps(); unsubscribeBps = null; }
            clearGlow();
            if (session) session.destroy();
            if (target) target.destroy();
            session = target = board = symbols = null;
        }
    };

    /**
     * Bring the target's breakpoints in line with the user's.
     *
     * Called on every change to the shared store, and once when a target first
     * exists. A marked block with no yield point in THIS build is left
     * unresolved rather than dropped: the store is the user's intent, and a
     * later build may well give it an address (`unreachableBreakpoints` in the
     * snapshot is what a UI shows for those).
     */
    function syncBreakpoints(ids) {
        if (!target) return;
        const wanted = new Set(ids);
        for (const [blockId, handle] of [...bps]) {
            if (wanted.has(blockId)) continue;
            if (handle !== null) target.clearBreakpoint(handle);
            bps.delete(blockId);
        }
        for (const blockId of wanted) {
            if (bps.has(blockId)) continue;
            const y = yieldOf.get(blockId);
            if (!y) continue;                      // no yield point in this build
            const handle = target.setBreakpoint({ kind: 'yield', task: y.task, state: y.state });
            bps.set(blockId, typeof handle === 'number' ? handle : null);
        }
    }

    return runner;
}
