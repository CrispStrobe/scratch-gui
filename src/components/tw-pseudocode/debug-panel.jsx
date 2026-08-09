import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import DebugDrawer from './debug-drawer.jsx';

/**
 * The debugger's controls: ⚑ ⏸ ⏭ ⏹, a speed dial, and what the program is doing.
 *
 * Design: `sb3-creator/reference/debugger-ui.md`. Two things it deliberately gets right:
 *
 * 1. **`block` is the only step verb here.** It is the one kind every target supports —
 *    emulator, ucsim, and the on-chip monitor — and "run to the next yield" is what a
 *    Scratch user means by "next". `insn` / `over` / `out` belong in the advanced drawer,
 *    which does not exist yet; `line` is refused outright by the target and is not offered.
 * 2. **A control that cannot work says why.** Capabilities are queried, never assumed, and
 *    a disabled button carries its reason in the tooltip. A dead button that explains
 *    itself teaches the hardware; a dead button that does not reads as a bug.
 *
 * **Why it lives in the Circuit tab rather than the stage header**, which is what the design
 * note describes: the stage header is shown for EVERY project, including pure Scratch ones,
 * where a debugger strip is meaningless. Putting it there means teaching shared chrome to
 * detect hardware projects. The Circuit tab is already the hardware surface, already gated,
 * and already shows the board you want to watch while stepping. The glow lands in the Blocks
 * tab either way — `vm.runtime.glowBlock` does not care which tab is open. Moving the strip
 * into the stage header, once the chrome knows what an STC project is, changes nothing here.
 */

const L10N = {
    en: {
        run: 'Run', pause: 'Pause', step: 'Step', stop: 'Stop',
        speed: 'Speed', idle: 'not running', building: 'building…', attaching: 'starting…',
        ready: 'ready', running: 'running', paused: 'paused', stepping: 'stepping…',
        error: 'error',
        stepHint: 'Run to the next block boundary',
        pausedAt: 'Paused at', afterMs: 'after',
        noPins: 'Declare pins in the Code tab to debug this project.',
        bps: 'Pause points', noBps: 'Right-click a block and choose “Pause here”.',
        unreachable: 'cannot be stopped at',
        unreachableWhy: 'The program only stops at a wait or a loop, so these marks have ' +
            'nowhere to land in this build. They are kept in case a later edit gives them one.',
        yieldNote: 'The program can only stop at a wait or a loop — so the highlight marks ' +
            'the last one it passed, not every block in between.'
    },
    de: {
        run: 'Start', pause: 'Pause', step: 'Schritt', stop: 'Stopp',
        speed: 'Tempo', idle: 'läuft nicht', building: 'wird gebaut…', attaching: 'startet…',
        ready: 'bereit', running: 'läuft', paused: 'angehalten', stepping: 'Schritt…',
        error: 'Fehler',
        stepHint: 'Bis zur nächsten Blockgrenze laufen',
        pausedAt: 'Angehalten bei', afterMs: 'nach',
        noPins: 'Für das Debuggen im Code-Tab Pins deklarieren.',
        bps: 'Haltepunkte', noBps: 'Rechtsklick auf einen Block, dann „Hier anhalten“.',
        unreachable: 'nicht anhaltbar',
        unreachableWhy: 'Das Programm hält nur bei einem Warten oder einer Schleife an; diese ' +
            'Markierungen haben in diesem Build keinen Platz. Sie bleiben erhalten, falls eine ' +
            'spätere Änderung einen schafft.',
        yieldNote: 'Das Programm kann nur bei einem Warten oder einer Schleife anhalten — die ' +
            'Markierung zeigt also die letzte solche Stelle, nicht jeden Block dazwischen.'
    }
};

const BTN = {
    padding: '6px 12px', borderRadius: 4, border: '1px solid #2c3e50',
    background: '#16213e', color: '#ecf0f1', fontFamily: 'monospace', fontSize: 12,
    cursor: 'pointer'
};
const OFF = {...BTN, color: '#4a5568', cursor: 'not-allowed'};

class DebugPanel extends React.Component {
    constructor (props) {
        super(props);
        this.state = {runner: null, ui: {phase: 'idle', message: ''}};
        this.onStart = this.onStart.bind(this);
        this.onPause = this.onPause.bind(this);
        this.onStep = this.onStep.bind(this);
        this.onStop = this.onStop.bind(this);
        this.onSpeed = this.onSpeed.bind(this);
    }

    componentWillUnmount () {
        if (this.state.runner) this.state.runner.destroy();
    }

    tx (key) {
        const table = L10N[this.props.locale] || L10N.en;
        return table[key] || L10N.en[key];
    }

    async runner () {
        if (this.state.runner) return this.state.runner;
        const {createDebugRunner} = await import(
            /* webpackChunkName: "bw-debug" */ '../../lib/bw-debug/debug-runner.js');
        const runner = createDebugRunner({
            vm: this.props.vm,
            onChange: (ui) => {
                this.setState({ui});
                // The board only exists after attach, and the tab has to be told:
                // until it is, the designer is showing a board of its own that
                // nothing drives. See circuit-tab.jsx.
                if (this.props.onRunnerChange) this.props.onRunnerChange(runner, ui);
            }
        });
        if (this.props.onRunnerChange) this.props.onRunnerChange(runner, this.state.ui);
        // setState is async, so hand the instance back directly rather than
        // reading it out of state on the very next line.
        this.setState({runner});
        return runner;
    }

    async onStart () {
        const runner = await this.runner();
        const phase = this.state.ui.phase;
        if (phase === 'paused') runner.resume();
        else await runner.start();
    }

    onPause () { if (this.state.runner) this.state.runner.pause(); }
    onStop () { if (this.state.runner) this.state.runner.stop(); }
    async onStep () { (await this.runner()).step('block'); }
    onSpeed (e) { if (this.state.runner) this.state.runner.setSpeed(Number(e.target.value)); }

    render () {
        const {ui} = this.state;
        const {phase, message} = ui;
        const running = phase === 'running' || phase === 'stepping';
        const paused = phase === 'paused';
        const busy = phase === 'building' || phase === 'attaching';
        const why = ui.session && ui.session.why;

        // Capabilities decide what is offered — never an assumption about which
        // target is attached. Before one is attached there is nothing to ask,
        // so the buttons reflect the phase alone.
        const caps = ui.capabilities;
        const canStep = !caps || caps.steps.includes('block');

        return (
            <div style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
                background: '#1a1a2e', border: '1px solid #2c3e50', borderRadius: 8,
                fontFamily: 'monospace', fontSize: 12, color: '#bdc3c7'
            }}>
                <div style={{display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap'}}>
                    <button
                        style={running || busy ? OFF : {...BTN, borderColor: '#2ecc71', color: '#2ecc71'}}
                        disabled={running || busy}
                        onClick={this.onStart}
                        title={paused ? 'Resume' : 'Build, load and run'}
                    >{'▶ '}{this.tx('run')}</button>

                    <button
                        style={running ? BTN : OFF}
                        disabled={!running}
                        onClick={this.onPause}
                    >{'⏸ '}{this.tx('pause')}</button>

                    <button
                        style={canStep && !busy ? BTN : OFF}
                        disabled={!canStep || busy}
                        onClick={this.onStep}
                        title={canStep ? this.tx('stepHint')
                            : 'This target cannot step one block'}
                    >{'⏭ '}{this.tx('step')}</button>

                    <button
                        style={running || paused ? {...BTN, borderColor: '#c0392b', color: '#e74c3c'} : OFF}
                        disabled={!running && !paused}
                        onClick={this.onStop}
                    >{'⏹ '}{this.tx('stop')}</button>

                    <span style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6}}>
                        <label htmlFor="bw-debug-speed">{this.tx('speed')}</label>
                        <select
                            id="bw-debug-speed"
                            defaultValue="1"
                            onChange={this.onSpeed}
                            style={{...BTN, padding: '3px 6px'}}
                        >
                            <option value="0.1">{'0.1×'}</option>
                            <option value="0.5">{'0.5×'}</option>
                            <option value="1">{'1×'}</option>
                            <option value="4">{'4×'}</option>
                        </select>
                    </span>
                </div>

                <div style={{display: 'flex', gap: 10, alignItems: 'baseline'}}>
                    <strong style={{color: phase === 'error' ? '#e74c3c'
                        : running ? '#2ecc71' : paused ? '#f39c12' : '#7f8c8d'}}>
                        {this.tx(phase) || phase}
                    </strong>
                    {message ? <span style={{color: '#7f8c8d'}}>{message}</span> : null}
                </div>

                {/* What the user has marked, and what this build can actually do
                    with it. A mark on a block with no yield point is kept rather
                    than refused (block-menu.js), so it has to be VISIBLE — an
                    invisible mark that never fires is the worst of both. */}
                <div style={{borderTop: '1px solid #2c3e50', paddingTop: 8}}>
                    <div style={{color: '#7f8c8d', marginBottom: 4}}>
                        {this.tx('bps')}
                        {ui.breakpoints && ui.breakpoints.length
                            ? ` (${ui.breakpoints.length})` : ''}
                    </div>
                    {!ui.breakpoints || !ui.breakpoints.length ? (
                        <div style={{color: '#5d6d7e'}}>{this.tx('noBps')}</div>
                    ) : (
                        <div style={{color: '#95a5a6'}}>
                            {ui.breakpoints.map(id => {
                                const dead = (ui.unreachableBreakpoints || []).includes(id);
                                return (
                                    <div key={id} style={{color: dead ? '#7f8c8d' : '#ecf0f1'}}>
                                        {'● '}
                                        {(ui.yieldKinds && ui.yieldKinds[id]) || id.slice(0, 8)}
                                        {dead ? ` — ${this.tx('unreachable')}` : ''}
                                    </div>
                                );
                            })}
                            {(ui.unreachableBreakpoints || []).length ? (
                                <div style={{fontSize: 11, marginTop: 4, color: '#7f8c8d'}}>
                                    {this.tx('unreachableWhy')}
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>

                {/* Parity with emu8051's TUI, closed by default: opening it is
                    the user declaring they want the engineer's view. */}
                {this.state.runner ? (
                    <DebugDrawer
                        runner={this.state.runner}
                        ui={ui}
                        locale={this.props.locale}
                        clockHz={this.props.clockHz}
                    />
                ) : null}

                {/* Level 1 is yield-to-yield. Say so, rather than letting the
                    highlight imply a precision the position does not have. */}
                {paused && why ? (
                    <div style={{color: '#95a5a6'}}>
                        <div>
                            {this.tx('pausedAt')}
                            {' '}
                            <code style={{color: '#ecf0f1'}}>
                                {`PC 0x${why.pc.toString(16).padStart(4, '0')}`}
                            </code>
                            {' '}
                            {this.tx('afterMs')}
                            {' '}
                            {`${(Number(why.tNs) / 1e6).toFixed(2)} ms`}
                        </div>
                        <div style={{fontSize: 11, marginTop: 4}}>{this.tx('yieldNote')}</div>
                    </div>
                ) : null}
            </div>
        );
    }
}

DebugPanel.propTypes = {
    clockHz: PropTypes.number,
    onRunnerChange: PropTypes.func,
    locale: PropTypes.string,
    vm: PropTypes.shape({toJSON: PropTypes.func, runtime: PropTypes.object}).isRequired
};

export default connect(state => ({
    vm: state.scratchGui.vm,
    locale: state.locales.locale
}))(DebugPanel);
