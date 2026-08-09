import React from 'react';
import PropTypes from 'prop-types';

/**
 * What is happening — the layer a debugger for this audience should LEAD with.
 *
 * The drawer next door is emu8051's TUI: PC, A, DPTR, SFRs, hex. It is correct
 * and it is the wrong first thing to show someone who has just written
 * `change counter by 1`. Every mature debugger — DevTools, VS Code — puts the
 * user's own nouns first and the machine's underneath, and the only reason this
 * one could not was that nothing knew which memory held `counter`. Now the
 * symbol table carries the name the user typed, so it can.
 *
 * Three ideas, in the order they earn their place:
 *
 * 1. **Their nouns, not the machine's.** Variables by the name they typed; pins
 *    as physical facts — `led1 is on`, `pot is at 2.47 V` — with the active-low
 *    inversion already applied, because "P1.0 = 0" teaches the opposite of what
 *    the board is for.
 *
 * 2. **Change, not just state.** A value that moved since the last stop is
 *    marked, with its previous value beside it. Seeing WHAT CHANGED is most of
 *    debugging; a wall of identical numbers is not.
 *
 * 3. **Time travel.** The trace already records a full snapshot at every stop,
 *    so the timeline can scrub back through them. This is the one genuinely
 *    modern debugger idea (Redux DevTools, Replay, rr) and here it is nearly
 *    free — the recording exists, it only needed an axis. Scrubbing is
 *    explicitly READ-ONLY and says so: the program is not being rewound, you
 *    are looking at what was recorded. Claiming otherwise would be the same
 *    class of lie as a multimeter reading ohms on a live circuit.
 */

const CARD = {
    background: '#12121f', border: '1px solid #2c3e50', borderRadius: 8, padding: 10
};
const LABEL = {
    color: '#7f8c8d', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8
};
const NAME = {color: '#bdc3c7', fontFamily: 'inherit'};
const VALUE = {
    fontFamily: 'monospace', fontSize: 15, color: '#ecf0f1', fontWeight: 600
};
const CHANGED = {...VALUE, color: '#f39c12'};

const L10N = {
    en: {
        vars: 'Variables', pins: 'Pins', timeline: 'Timeline',
        noVars: 'This project has no variables yet.',
        noPins: 'No pins declared.',
        was: 'was', on: 'on', off: 'off', live: 'live', past: 'looking at the past',
        now: 'Now', stops: 'stops recorded', scrubHint:
            'Drag to look back through recorded stops. The program is not rewound — ' +
            'this is what was recorded then.',
        activeLow: 'active low: the pin drives 0 to turn it on',
        analog: 'analog input', input: 'input', output: 'output',
        nothing: 'Run the program to see values here.'
    },
    de: {
        vars: 'Variablen', pins: 'Pins', timeline: 'Zeitachse',
        noVars: 'Dieses Projekt hat noch keine Variablen.',
        noPins: 'Keine Pins deklariert.',
        was: 'war', on: 'an', off: 'aus', live: 'aktuell', past: 'Blick in die Vergangenheit',
        now: 'Jetzt', stops: 'Haltepunkte aufgezeichnet', scrubHint:
            'Ziehen, um aufgezeichnete Haltepunkte anzusehen. Das Programm wird nicht ' +
            'zurückgespult — das ist, was damals aufgezeichnet wurde.',
        activeLow: 'aktiv niedrig: der Pin schreibt 0 zum Einschalten',
        analog: 'Analogeingang', input: 'Eingang', output: 'Ausgang',
        nothing: 'Programm starten, um hier Werte zu sehen.'
    }
};

class DebugInspector extends React.Component {
    constructor (props) {
        super(props);
        // null = live. A number = an index into the trace, i.e. the past.
        this.state = {scrubIndex: null};
        this.onScrub = this.onScrub.bind(this);
        this.toLive = this.toLive.bind(this);
    }

    tx (key) {
        const table = L10N[this.props.locale] || L10N.en;
        return table[key] || L10N.en[key];
    }

    onScrub (e) {
        const rows = this.props.runner.trace();
        const i = Number(e.target.value);
        this.setState({scrubIndex: i >= rows.length - 1 ? null : i});
    }

    toLive () { this.setState({scrubIndex: null}); }

    /**
     * The values to render, and the ones before them.
     *
     * Live: current values, compared against the last recorded stop. Scrubbed:
     * the chosen row, compared against the row before it — so "what changed"
     * means the same thing in both, which is what makes the timeline readable.
     */
    valuesAndPrevious () {
        const {runner} = this.props;
        const rows = runner.trace().filter(r => r.variables);
        const {scrubIndex} = this.state;
        if (scrubIndex === null) {
            return {
                variables: runner.variables(),
                previous: rows.length ? rows[rows.length - 1].variables : null,
                live: true,
                rows
            };
        }
        const i = Math.min(scrubIndex, rows.length - 1);
        return {
            variables: rows[i] ? rows[i].variables : [],
            previous: i > 0 ? rows[i - 1].variables : null,
            live: false,
            rows,
            row: rows[i]
        };
    }

    renderTimeline (rows, live) {
        if (rows.length < 2) return null;
        const value = this.state.scrubIndex === null ? rows.length - 1 : this.state.scrubIndex;
        const row = rows[Math.min(value, rows.length - 1)];
        return (
            <div style={{...CARD, marginBottom: 8}}>
                <div style={{...LABEL, display: 'flex', alignItems: 'center', gap: 8}}>
                    <span>{this.tx('timeline')}</span>
                    <span style={{
                        marginLeft: 'auto', textTransform: 'none', letterSpacing: 0,
                        color: live ? '#2ecc71' : '#f39c12'
                    }}>
                        {live ? this.tx('live') : this.tx('past')}
                    </span>
                    {live ? null : (
                        <button
                            onClick={this.toLive}
                            style={{
                                padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                                border: '1px solid #2c3e50', background: '#16213e',
                                color: '#ecf0f1', fontSize: 11, textTransform: 'none'
                            }}
                        >{`⇥ ${this.tx('now')}`}</button>
                    )}
                </div>
                <input
                    type="range"
                    min={0}
                    max={rows.length - 1}
                    value={value}
                    onChange={this.onScrub}
                    style={{width: '100%'}}
                    aria-label={this.tx('timeline')}
                />
                <div style={{display: 'flex', fontSize: 11, color: '#7f8c8d'}}>
                    <span>{`${rows.length} ${this.tx('stops')}`}</span>
                    <span style={{marginLeft: 'auto', fontFamily: 'monospace'}}>
                        {row ? `${(Number(row.tNs) / 1e6).toFixed(2)} ms · ${row.why}` : ''}
                    </span>
                </div>
                <div style={{fontSize: 11, color: '#5d6d7e', marginTop: 4}}>
                    {this.tx('scrubHint')}
                </div>
            </div>
        );
    }

    renderVariables (variables, previous) {
        const prev = new Map((previous || []).map(v => [v.name, v.value]));
        return (
            <div style={CARD}>
                <div style={LABEL}>{this.tx('vars')}</div>
                {!variables.length ? (
                    <div style={{color: '#5d6d7e', fontSize: 12}}>{this.tx('noVars')}</div>
                ) : variables.map(v => {
                    const before = prev.has(v.name) ? prev.get(v.name) : null;
                    const moved = before !== null && before !== v.value;
                    return (
                        <div
                            key={`${v.sprite || ''}${v.name}`}
                            style={{
                                display: 'flex', alignItems: 'baseline', gap: 8,
                                padding: '3px 0'
                            }}
                            title={v.where}
                        >
                            <span style={NAME}>{v.name}</span>
                            {v.sprite ? (
                                <span style={{color: '#5d6d7e', fontSize: 11}}>{v.sprite}</span>
                            ) : null}
                            <span style={{marginLeft: 'auto', textAlign: 'right'}}>
                                <span style={moved ? CHANGED : VALUE}>{v.value}</span>
                                {moved ? (
                                    <span style={{color: '#5d6d7e', fontSize: 11, marginLeft: 6}}>
                                        {`${this.tx('was')} ${before}`}
                                    </span>
                                ) : null}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    }

    renderPins () {
        const pins = this.props.runner.pins();
        return (
            <div style={CARD}>
                <div style={LABEL}>{this.tx('pins')}</div>
                {!pins.length ? (
                    <div style={{color: '#5d6d7e', fontSize: 12}}>{this.tx('noPins')}</div>
                ) : pins.map(p => (
                    <div
                        key={p.pin}
                        style={{display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0'}}
                        title={p.activeLow ? this.tx('activeLow') : ''}
                    >
                        {/* The dot IS the answer for a digital pin. A number
                            would make the reader do the active-low inversion
                            in their head, which is the mistake this board
                            exists to prevent. */}
                        {p.direction === 'analog' ? (
                            <span style={{width: 10, height: 10, borderRadius: 2,
                                background: '#3498db', display: 'inline-block'}} />
                        ) : (
                            <span style={{
                                width: 10, height: 10, borderRadius: '50%', display: 'inline-block',
                                background: p.on ? '#2ecc71' : '#2c3e50',
                                boxShadow: p.on ? '0 0 6px #2ecc71' : 'none'
                            }} />
                        )}
                        <span style={NAME}>{p.name}</span>
                        <span style={{color: '#5d6d7e', fontSize: 11, fontFamily: 'monospace'}}>
                            {p.pin}
                        </span>
                        <span style={{marginLeft: 'auto', ...VALUE, fontSize: 13}}>
                            {p.direction === 'analog'
                                ? (p.volts === undefined ? '—' : `${p.volts.toFixed(2)} V`)
                                : (p.on === undefined ? '—' : (p.on ? this.tx('on') : this.tx('off')))}
                        </span>
                        {p.activeLow ? (
                            <span style={{color: '#5d6d7e', fontSize: 10}}>{'⌄0'}</span>
                        ) : null}
                    </div>
                ))}
            </div>
        );
    }

    render () {
        const {runner} = this.props;
        if (!runner) return null;
        const {variables, previous, live, rows} = this.valuesAndPrevious();
        const started = rows.length > 0 || variables.length > 0;
        if (!started) {
            return (
                <div style={{...CARD, color: '#5d6d7e', fontSize: 12}}>
                    {this.tx('nothing')}
                </div>
            );
        }
        return (
            <div>
                {this.renderTimeline(rows, live)}
                <div style={{
                    display: 'grid', gap: 8,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
                }}>
                    {this.renderVariables(variables, previous)}
                    {/* Pins are always LIVE: they come from the board, which has
                        no history to scrub. Showing a past pin state next to a
                        live one would be the more confusing lie. */}
                    {live ? this.renderPins() : null}
                </div>
            </div>
        );
    }
}

DebugInspector.propTypes = {
    runner: PropTypes.object,
    locale: PropTypes.string
};

export default DebugInspector;
