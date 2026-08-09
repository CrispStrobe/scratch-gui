import React from 'react';
import PropTypes from 'prop-types';

import {
    IO_SFRS, TIMER_SFRS, formatBytes, hex8, hex16
} from '../../lib/bw-debug/trace.js';
import {PSW_BITS, sfrName} from '../../lib/bw-debug/opcodes.js';

/**
 * "Under the hood" — parity with emu8051's TUI, as a GUI.
 *
 * ## What parity means here
 *
 * `mainview.c` draws eight boxes: a disassembly of executed instructions, a
 * register row per instruction, PSW bits, SP/ports/IP/IE, the timer and serial
 * SFRs, a memory window that cycles Low/Upr/SFR/Ext/ROM, the stack, and a
 * cycles/time readout. `memeditor.c` is a fuller hex editor on the same five
 * spaces, `logicboard.c` is the board, `options.c` the clock. The keys are:
 * step, run, speed, breakpoint at an address, go to address, reset, wipe,
 * reset the tick counter, and edit any value in place.
 *
 * Everything above is here, except the board — which is not missing, it is the
 * Circuit tab, and a second worse copy of it would be the wrong kind of parity.
 *
 * ## Where this deliberately differs, and why that is not a shortfall
 *
 * **Five of those eight boxes are one table.** They are not independent panes in
 * the TUI either: `mainview.c` keeps a single history ring and draws five
 * columns of it, scrolled together. Eight boxes across 80 columns is a terminal
 * layout constraint, not a design. Showing them as one row per instruction —
 * PC, opcode bytes, assembly, then registers, ports and timers as toggleable
 * column groups — is the same information with the relationship made visible
 * instead of implied.
 *
 * **Nothing is a bare number where a name exists.** `PSW` is eight named flags,
 * an SFR address is `TMOD` rather than `0x89` (names from stc_disasm's table),
 * and the register bank in use is marked rather than left to be decoded out of
 * PSW.4:3. The TUI's users know the 8051; this one's are learning it.
 *
 * **The trace says what it did not record.** The TUI records per instruction
 * because its loop single-steps; at speed it cannot keep up either. Here a free
 * run records at stops only, unless you ask for per-instruction tracing — and
 * the pane labels the difference rather than presenting a gap as a history.
 */

const MONO = {fontFamily: 'monospace', fontSize: 11};
const PANE = {
    background: '#12121f', border: '1px solid #2c3e50', borderRadius: 6,
    padding: 8, ...MONO, color: '#bdc3c7', overflow: 'auto'
};
const TITLE = {color: '#7f8c8d', fontSize: 10, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6};
const CELL = {padding: '1px 5px', textAlign: 'right', whiteSpace: 'nowrap'};
const BTN = {
    padding: '3px 8px', borderRadius: 3, border: '1px solid #2c3e50',
    background: '#16213e', color: '#ecf0f1', cursor: 'pointer', ...MONO
};

const L10N = {
    en: {
        title: 'Under the hood', hide: 'Hide', show: 'Show',
        trace: 'Execution trace', now: 'Registers', sfrs: 'Special function registers',
        memory: 'Memory', stack: 'Stack', clock: 'Clock',
        cols: 'Columns', regs: 'registers', ports: 'ports', timers: 'timers',
        stepInsn: 'Step instruction', over: 'Step over', out: 'Step out',
        setPc: 'Set PC', breakAt: 'Break at', reset: 'Reset', wipe: 'Wipe',
        stepTen: 'Step ×10', clear: 'Clear',
        tenHint: 'Ten instructions, each one a row in the trace',
        empty: 'Nothing has run yet. Press Run, then pause or hit a pause point.',
        gapNote: 'A row is recorded whenever the program stops — so stepping traces it ' +
            'instruction by instruction, while a free run records only where it stopped. ' +
            'Recording every instruction of a full-speed run is not possible: that is ' +
            'millions a second.',
        dropped: 'older rows dropped',
        bank: 'bank', cycles: 'cycles', ms: 'ms',
        spaceNote: 'SFR and internal RAM share these addresses and are different memories.',
        editHint: 'Click a byte to edit it.'
    },
    de: {
        title: 'Unter der Haube', hide: 'Verbergen', show: 'Zeigen',
        trace: 'Ablaufprotokoll', now: 'Register', sfrs: 'Spezialregister',
        memory: 'Speicher', stack: 'Stapel', clock: 'Takt',
        cols: 'Spalten', regs: 'Register', ports: 'Ports', timers: 'Timer',
        stepInsn: 'Ein Befehl', over: 'Überspringen', out: 'Heraus',
        setPc: 'PC setzen', breakAt: 'Halt bei', reset: 'Reset', wipe: 'Löschen',
        stepTen: 'Schritt ×10', clear: 'Leeren',
        tenHint: 'Zehn Befehle, jeder eine Zeile im Protokoll',
        empty: 'Es lief noch nichts. Auf Start drücken, dann anhalten.',
        gapNote: 'Eine Zeile entsteht bei jedem Anhalten — Einzelschritte protokollieren ' +
            'also Befehl für Befehl, ein freier Lauf nur die Haltepunkte. Jeden Befehl eines ' +
            'Laufs mit voller Geschwindigkeit aufzuzeichnen geht nicht: das sind Millionen ' +
            'pro Sekunde.',
        dropped: 'ältere Zeilen verworfen',
        bank: 'Bank', cycles: 'Zyklen', ms: 'ms',
        spaceNote: 'Spezialregister und internes RAM teilen sich diese Adressen und sind ' +
            'verschiedene Speicher.',
        editHint: 'Auf ein Byte klicken zum Ändern.'
    }
};

const SPACES = [
    {id: 'iram', label: 'Internal RAM', size: 0x100},
    {id: 'sfr', label: 'SFR', size: 0x100, base: 0x80},
    {id: 'xram', label: 'External RAM', size: 0x400},
    {id: 'code', label: 'Program (ROM)', size: 0x1000},
    {id: 'bit', label: 'Bit space', size: 0x100}
];

class DebugDrawer extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            open: false,
            space: 'iram',
            page: 0,
            showRegs: true,
            showPorts: false,
            showTimers: false
        };
        this.toggle = this.toggle.bind(this);
    }

    tx (key) {
        const table = L10N[this.props.locale] || L10N.en;
        return table[key] || L10N.en[key];
    }

    toggle () { this.setState(s => ({open: !s.open})); }

    /** Ask the user for a hex address. A prompt is honest about being a stopgap. */
    askAddress (label, fallback) {
        const raw = window.prompt(`${label} (hex)`, hex16(fallback || 0));
        if (raw === null) return null;
        const n = parseInt(String(raw).replace(/^0x/i, ''), 16);
        return Number.isFinite(n) ? (n & 0xFFFF) : null;
    }

    renderControls () {
        const {runner} = this.props;
        const caps = (this.props.ui && this.props.ui.capabilities) || null;
        const can = kind => !caps || caps.steps.includes(kind);
        const off = {...BTN, color: '#4a5568', cursor: 'not-allowed'};
        return (
            <div style={{display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8}}>
                <button
                    style={BTN}
                    onClick={() => runner.stepInstruction(1)}
                >{this.tx('stepInsn')}</button>
                <button
                    style={can('over') ? BTN : off}
                    disabled={!can('over')}
                    title={can('over') ? 'Run until SP returns to its current depth'
                        : 'This target cannot step over'}
                    onClick={() => runner.stepOver()}
                >{this.tx('over')}</button>
                <button
                    style={can('out') ? BTN : off}
                    disabled={!can('out')}
                    onClick={() => runner.stepOut()}
                >{this.tx('out')}</button>
                <button
                    style={BTN}
                    onClick={() => {
                        const a = this.askAddress(this.tx('setPc'), this.currentPc());
                        if (a !== null) runner.setPc(a);
                    }}
                >{this.tx('setPc')}</button>
                <button
                    style={BTN}
                    onClick={() => {
                        const a = this.askAddress(this.tx('breakAt'), this.currentPc());
                        if (a !== null) runner.toggleAddressBreakpoint(a);
                    }}
                >{this.tx('breakAt')}</button>
                <button style={BTN} onClick={() => runner.resetCpu()}>{this.tx('reset')}</button>
                <button style={BTN} onClick={() => runner.wipe()}>{this.tx('wipe')}</button>
                <button
                    style={BTN}
                    title={this.tx('tenHint')}
                    onClick={() => runner.stepInstruction(10)}
                >{this.tx('stepTen')}</button>
            </div>
        );
    }

    currentPc () {
        const snap = this.props.runner.inspect();
        return snap ? snap.pc : 0;
    }

    renderTrace () {
        const {runner} = this.props;
        const rows = runner.trace();
        const {showRegs, showPorts, showTimers} = this.state;
        const dropped = runner.traceDropped();

        return (
            <div style={{...PANE, maxHeight: 260}}>
                <div style={{...TITLE, display: 'flex', gap: 10, alignItems: 'center'}}>
                    <span>{this.tx('trace')}</span>
                    <span style={{marginLeft: 'auto', textTransform: 'none'}}>
                        {this.tx('cols')}
                        {[['showRegs', 'regs'], ['showPorts', 'ports'], ['showTimers', 'timers']]
                            .map(([key, label]) => (
                                <label key={key} style={{marginLeft: 6}}>
                                    <input
                                        type="checkbox"
                                        checked={this.state[key]}
                                        onChange={() => this.setState(s => ({[key]: !s[key]}))}
                                    />
                                    {this.tx(label)}
                                </label>
                            ))}
                    </span>
                    <button style={BTN} onClick={() => runner.clearTrace()}>{this.tx('clear')}</button>
                </div>
                {!rows.length ? (
                    <div style={{color: '#5d6d7e'}}>{this.tx('empty')}</div>
                ) : (
                    <table style={{borderCollapse: 'collapse', width: '100%'}}>
                        <thead>
                            <tr style={{color: '#7f8c8d'}}>
                                <th style={CELL}>{'PC'}</th>
                                <th style={{...CELL, textAlign: 'left'}}>{'Opcodes'}</th>
                                <th style={{...CELL, textAlign: 'left'}}>{'Assembly'}</th>
                                {showRegs ? ['A', 'B', 'DPTR', 'SP', 'PSW'].map(h =>
                                    <th key={h} style={CELL}>{h}</th>) : null}
                                {showRegs ? [0, 1, 2, 3, 4, 5, 6, 7].map(n =>
                                    <th key={n} style={CELL}>{`R${n}`}</th>) : null}
                                {showPorts ? IO_SFRS.map(s =>
                                    <th key={s.name} style={CELL}>{s.name}</th>) : null}
                                {showTimers ? TIMER_SFRS.map(s =>
                                    <th key={s.name} style={CELL}>{s.name}</th>) : null}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.slice(-200).map(row => (
                                <tr key={row.seq} style={{color: '#ecf0f1'}}>
                                    <td style={{...CELL, color: '#3498db'}}>{hex16(row.pc)}</td>
                                    <td style={{...CELL, textAlign: 'left', color: '#7f8c8d'}}>
                                        {formatBytes(row.bytes)}
                                    </td>
                                    <td style={{...CELL, textAlign: 'left'}}>{row.text}</td>
                                    {showRegs ? [
                                        <td key="a" style={CELL}>{hex8(row.a)}</td>,
                                        <td key="b" style={CELL}>{hex8(row.b)}</td>,
                                        <td key="d" style={CELL}>{hex16(row.dptr)}</td>,
                                        <td key="s" style={CELL}>{hex8(row.sp)}</td>,
                                        <td key="p" style={CELL}>{hex8(row.psw)}</td>
                                    ] : null}
                                    {showRegs ? row.r.map((v, n) =>
                                        <td key={`r${n}`} style={CELL}>{hex8(v)}</td>) : null}
                                    {showPorts ? IO_SFRS.map(s =>
                                        <td key={s.name} style={CELL}>{hex8(row.sfr[s.name])}</td>) : null}
                                    {showTimers ? TIMER_SFRS.map(s =>
                                        <td key={s.name} style={CELL}>{hex8(row.sfr[s.name])}</td>) : null}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div style={{color: '#5d6d7e', marginTop: 6, fontSize: 10}}>
                    {dropped ? `${dropped} ${this.tx('dropped')}. ` : ''}
                    {this.tx('gapNote')}
                </div>
            </div>
        );
    }

    /**
     * Write a register by writing where it LIVES. Every 8051 register is a
     * memory location — the accumulator is SFR 0xE0, R3 is internal RAM at
     * bank×8+3 — so editing one needs no new emulator API, and going through
     * the same writeMem the hex view uses means the two can never disagree
     * about what a register is.
     */
    editRegister (name, value, where) {
        const raw = window.prompt(`${name}`, where.wide ? hex16(value) : hex8(value));
        if (raw === null) return;
        const v = parseInt(String(raw).replace(/^0x/i, ''), 16);
        if (!Number.isFinite(v)) return;
        if (where.wide) {
            this.props.runner.writeMem(where.space, where.addr, (v >> 8) & 0xFF);
            this.props.runner.writeMem(where.space, where.addr + 1, v & 0xFF);
        } else {
            this.props.runner.writeMem(where.space, where.addr, v);
        }
        this.forceUpdate();
    }

    renderNow () {
        const snap = this.props.runner.inspect();
        if (!snap) return null;
        const {regs} = snap;
        const editable = (name, value, where) => (
            <span
                key={name}
                role="button"
                tabIndex={-1}
                title={this.tx('editHint')}
                style={{cursor: 'pointer'}}
                onClick={() => this.editRegister(name, value, where)}
            >
                <span style={{color: '#7f8c8d'}}>{`${name} `}</span>
                <span style={{color: '#ecf0f1', borderBottom: '1px dotted #2c3e50'}}>
                    {where.wide ? hex16(value) : hex8(value)}
                </span>
            </span>
        );
        // DPH is 0x83 and DPL 0x82, so a 16-bit DPTR is written high byte first
        // at 0x83 — hence `wide` writing addr then addr+1 with DPH given first.
        return (
            <div style={PANE}>
                <div style={TITLE}>{this.tx('now')}</div>
                <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6}}>
                    <span
                        role="button"
                        tabIndex={-1}
                        title={this.tx('setPc')}
                        style={{cursor: 'pointer'}}
                        onClick={() => {
                            const a = this.askAddress(this.tx('setPc'), regs.pc);
                            if (a !== null) { this.props.runner.setPc(a); this.forceUpdate(); }
                        }}
                    >
                        <span style={{color: '#7f8c8d'}}>{'PC '}</span>
                        <span style={{color: '#ecf0f1', borderBottom: '1px dotted #2c3e50'}}>
                            {hex16(regs.pc)}
                        </span>
                    </span>
                    {editable('A', regs.a, {space: 'sfr', addr: 0xE0})}
                    {editable('B', regs.b, {space: 'sfr', addr: 0xF0})}
                    {editable('DPTR', regs.dptr, {space: 'sfr', addr: 0x83, wide: true})}
                    {editable('SP', regs.sp, {space: 'sfr', addr: 0x81})}
                    {editable('PSW', regs.psw, {space: 'sfr', addr: 0xD0})}
                    <span style={{color: '#f39c12'}}>
                        {`${this.tx('bank')} ${regs.bank}`}
                    </span>
                </div>
                {/* R0-R7 are the CURRENT bank's — the bank is stated rather than
                    left to be decoded out of PSW.4:3, as §6 requires, and it is
                    also what decides where a write to R3 lands. */}
                <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6}}>
                    {regs.r.map((v, n) =>
                        editable(`R${n}`, v, {space: 'iram', addr: (regs.bank * 8) + n}))}
                </div>
                {/* PSW as named flags. The TUI prints eight bare digits under a
                    "C-ACF0R1R0Ov--P" header and expects you to know it. */}
                <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                    {PSW_BITS.map(b => {
                        const on = (regs.psw >> b.bit) & 1;
                        return (
                            <span
                                key={b.name}
                                title={b.title}
                                style={{
                                    padding: '1px 5px', borderRadius: 3,
                                    border: '1px solid #2c3e50',
                                    background: on ? '#1e5631' : 'transparent',
                                    color: on ? '#2ecc71' : '#5d6d7e'
                                }}
                            >{b.name}</span>
                        );
                    })}
                </div>
            </div>
        );
    }

    renderSfrs () {
        const snap = this.props.runner.inspect();
        if (!snap) return null;
        return (
            <div style={PANE}>
                <div style={TITLE}>{this.tx('sfrs')}</div>
                {[['I/O', IO_SFRS], ['Timers / serial', TIMER_SFRS]].map(([group, list]) => (
                    <div key={group} style={{marginBottom: 6}}>
                        <div style={{color: '#5d6d7e', fontSize: 10}}>{group}</div>
                        <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
                            {list.map(s => (
                                <span key={s.name} title={`${sfrName(s.addr)} @ 0x${hex8(s.addr)}`}>
                                    <span style={{color: '#7f8c8d'}}>{`${s.name} `}</span>
                                    <span style={{color: '#ecf0f1'}}>{hex8(snap.sfr[s.name])}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    renderStack () {
        const snap = this.props.runner.inspect();
        if (!snap) return null;
        return (
            <div style={{...PANE, maxHeight: 160}}>
                <div style={TITLE}>{this.tx('stack')}</div>
                {!snap.stack.length ? (
                    <div style={{color: '#5d6d7e'}}>{'empty'}</div>
                ) : snap.stack.slice().reverse().map(e => (
                    <div key={e.addr}>
                        <span style={{color: '#7f8c8d'}}>{`${hex8(e.addr)} `}</span>
                        <span style={{color: e.addr === snap.regs.sp ? '#f39c12' : '#ecf0f1'}}>
                            {hex8(e.value)}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    renderMemory () {
        const {runner} = this.props;
        const spec = SPACES.find(s => s.id === this.state.space) || SPACES[0];
        const base = spec.base || 0;
        const perPage = 128;
        const start = base + (this.state.page * perPage);
        const bytes = runner.readMem(spec.id, start, perPage);
        const rows = [];
        for (let i = 0; i < bytes.length; i += 16) rows.push({addr: start + i, data: bytes.slice(i, i + 16)});
        const pages = Math.ceil(spec.size / perPage);

        return (
            <div style={{...PANE, maxHeight: 240}}>
                <div style={{...TITLE, display: 'flex', gap: 8, alignItems: 'center'}}>
                    <span>{this.tx('memory')}</span>
                    <select
                        value={this.state.space}
                        onChange={e => this.setState({space: e.target.value, page: 0})}
                        style={{...BTN, textTransform: 'none'}}
                    >
                        {SPACES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <button
                        style={BTN}
                        disabled={this.state.page === 0}
                        onClick={() => this.setState(s => ({page: Math.max(0, s.page - 1)}))}
                    >{'◀'}</button>
                    <span>{`${hex16(start)}–${hex16(start + perPage - 1)}`}</span>
                    <button
                        style={BTN}
                        disabled={this.state.page >= pages - 1}
                        onClick={() => this.setState(s => ({page: Math.min(pages - 1, s.page + 1)}))}
                    >{'▶'}</button>
                </div>
                {rows.map(row => (
                    <div key={row.addr} style={{whiteSpace: 'nowrap'}}>
                        <span style={{color: '#3498db'}}>{`${hex16(row.addr)}  `}</span>
                        {row.data.map((b, i) => (
                            <span
                                key={i}
                                role="button"
                                tabIndex={-1}
                                title={`${hex16(row.addr + i)} — ${this.tx('editHint')}`}
                                style={{color: b ? '#ecf0f1' : '#4a5568', cursor: 'pointer', padding: '0 2px'}}
                                onClick={() => {
                                    const raw = window.prompt(
                                        `${spec.label} ${hex16(row.addr + i)}`, hex8(b));
                                    if (raw === null) return;
                                    const v = parseInt(String(raw).replace(/^0x/i, ''), 16);
                                    if (Number.isFinite(v)) {
                                        runner.writeMem(spec.id, row.addr + i, v);
                                        this.forceUpdate();
                                    }
                                }}
                            >{hex8(b)}</span>
                        ))}
                    </div>
                ))}
                {/* The trap §6 names: these two spaces overlap numerically and
                    are different memories. A hex view that does not say so
                    invites reading one and believing the other. */}
                {spec.id === 'sfr' || spec.id === 'iram' ? (
                    <div style={{color: '#5d6d7e', marginTop: 6, fontSize: 10}}>
                        {this.tx('spaceNote')}
                    </div>
                ) : null}
            </div>
        );
    }

    renderClock () {
        const snap = this.props.runner.inspect();
        if (!snap) return null;
        const ms = Number(snap.tNs) / 1e6;
        const hz = this.props.clockHz || 11059200;
        // The TUI shows "Cycles"; this emulator counts nanoseconds, so cycles
        // are derived rather than read. Stated, not silently presented as if
        // counted.
        const cycles = Math.round((Number(snap.tNs) / 1e9) * hz);
        return (
            <div style={PANE}>
                <div style={TITLE}>{this.tx('clock')}</div>
                <div>{`${ms.toFixed(3)} ${this.tx('ms')}`}</div>
                <div style={{color: '#7f8c8d'}}>
                    {`${cycles.toLocaleString()} ${this.tx('cycles')} @ ${(hz / 1e6).toFixed(3)} MHz`}
                </div>
            </div>
        );
    }

    render () {
        const {runner} = this.props;
        if (!runner) return null;
        const {open} = this.state;
        return (
            <div style={{marginTop: 8}}>
                <button
                    style={{...BTN, width: '100%', textAlign: 'left', padding: '6px 10px'}}
                    onClick={this.toggle}
                >
                    {open ? '▾ ' : '▸ '}
                    {this.tx('title')}
                </button>
                {!open ? null : (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8}}>
                        {this.renderControls()}
                        {this.renderTrace()}
                        <div style={{display: 'grid', gap: 8,
                            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'}}>
                            {this.renderNow()}
                            {this.renderSfrs()}
                            {this.renderStack()}
                            {this.renderClock()}
                        </div>
                        {this.renderMemory()}
                    </div>
                )}
            </div>
        );
    }
}

DebugDrawer.propTypes = {
    runner: PropTypes.object,
    ui: PropTypes.object,
    locale: PropTypes.string,
    clockHz: PropTypes.number
};

export default DebugDrawer;
