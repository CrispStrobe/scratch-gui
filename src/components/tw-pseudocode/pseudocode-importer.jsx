import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import examples from '../../lib/sb3-creator-examples.js';

/**
 * "Pseudocode" editor tab: the full SB3 Creator tool inside the editor.
 *  - load a built-in example
 *  - a collapsible syntax reference
 *  - upload SVGs and bake them in as sprite costumes
 *  - compile pseudocode into blocks and load it into the running VM
 *  - "From blocks": decompile the running project back into pseudocode (two-way)
 */

// Grouped catalogue of built-in examples (mirrors the standalone app).
const GROUPS = [
    {label: 'Games', items: [
        ['snake', '🐍 Snake'], ['snake_pro', '🐍 Snake (growing tail)'], ['breakout', '🧱 Breakout'],
        ['pong_2p', '🏓 Pong (2 players)'], ['pong_ai', '🤖 Pong (vs AI)'], ['tetris', '🟦 Tetris'],
        ['sokoban', '📦 Sokoban'], ['bomberman', '💣 Bomberman'], ['invaders', '👾 Space Invaders'],
        ['flappy', '🐤 Flappy'], ['tictactoe', '⭕ Tic-Tac-Toe (2 players)'], ['tictactoe_ai', '⭕ Tic-Tac-Toe (vs AI)'],
        ['g2048', '🔢 2048'], ['maze', '👻 Maze Chase'], ['connect4', '🔴 Connect Four (vs AI)'], ['minesweeper', '💥 Minesweeper']
    ]},
    {label: 'Demos', items: [
        ['game', '🎯 Complete Game'], ['art', '🎨 Digital Art'], ['physics', '⚡ Physics Demo'],
        ['animation', '🎞️ Animation & Sound'], ['educational', '📚 Educational Tool']
    ]},
    {label: 'Language basics', items: [
        ['motion', 'Motion'], ['looks', 'Looks'], ['sound', 'Sound'], ['pen', 'Pen'],
        ['sensing', 'Sensing'], ['control', 'Control'], ['operators', 'Operators']
    ]}
];

const SYNTAX = [
    ['Structure', ['SPRITE Name:', 'STAGE:', 'GLOBAL score / LOCAL hp', 'LIST inventory',
        'SHAPE rect 16 90 / circle 18', 'SHAPE polygon 20 0 40 40 0 40 #f53',
        'COSTUME walk2 / BACKDROP night', 'SOUND jump 660', '# comment']],
    ['Events (hats)', ['WHEN flag clicked:', 'WHEN space key pressed:', 'WHEN sprite clicked:',
        'WHEN I receive "go":', 'WHEN I start as a clone:']],
    ['Control', ['FOREVER:', 'REPEAT 10:', 'REPEAT UNTIL x > 5:', 'IF cond THEN: / ELSE:',
        'wait until cond', 'stop all / stop this script']],
    ['Clones & broadcasts', ['create clone of myself', 'create clone of Bullet', 'delete this clone',
        'broadcast "go"', 'broadcast "go" and wait']],
    ['Motion & Looks', ['move 10 steps', 'go to x: 0 y: 0', 'glide 1 secs to x: 50 y: 0',
        'point towards mouse-pointer', 'set size to 80 / set ghost effect to 50']],
    ['Data & lists', ['set score to 0', 'change score by 1', 'add 5 to nums',
        'delete all of nums', 'replace item 1 of nums with 9']],
    ['Expressions', ['(a + b) * c, 7 mod 3', 'pick random 1 to 10', 'round x, sqrt of x',
        '"Score: " join score', 'x position, size, timer, answer']],
    ['Conditions', ['a > b, a <= b, a = b', 'cond and cond / or / not cond',
        'touching Sprite / touching color #ff0000', 'key space pressed? / mouse down?', 'nums contains 3']],
    ['Custom blocks', ['DEFINE draw box (col) (row):', 'DEFINE FAST render: (warp)',
        '<flag> = boolean parameter', 'call: draw box 3 4', 'params in body: go to x: col y: row']],
    ['Sensing & more', ['x position of Player', 'current year, day of week',
        'distance to mouse-pointer', 'set drag mode draggable', 'play note 60 for 0.5 beats, set tempo to 120']]
];

class PseudocodeImporter extends React.Component {
    constructor (props) {
        super(props);
        this.state = {code: '', uploads: [], status: '', busy: false, showRef: false};
        this.handleFiles = this.handleFiles.bind(this);
        this.compile = this.compile.bind(this);
        this.fromBlocks = this.fromBlocks.bind(this);
        this.loadExample = this.loadExample.bind(this);
    }
    loadExample (key) {
        if (key && examples[key]) this.setState({code: examples[key], status: `Loaded example: ${key}`});
    }
    handleFiles (e) {
        const files = Array.from(e.target.files || []);
        files.forEach(f => {
            if (!/\.svg$/i.test(f.name) && !f.type.includes('svg')) return;
            const reader = new FileReader();
            reader.onload = () => this.setState(s => ({
                uploads: [...s.uploads, {sprite: '', filename: f.name, svg: String(reader.result), mode: 'replace'}]
            }));
            reader.readAsText(f);
        });
        e.target.value = '';
    }
    setUpload (i, patch) {
        this.setState(s => ({uploads: s.uploads.map((u, idx) => (idx === i ? {...u, ...patch} : u))}));
    }
    removeUpload (i) {
        this.setState(s => ({uploads: s.uploads.filter((_, idx) => idx !== i)}));
    }
    async compile () {
        this.setState({busy: true, status: 'Compiling…'});
        try {
            const mod = await import(/* webpackChunkName: "sb3-creator" */ '../../lib/sb3-creator.js');
            const SB3Creator = mod.default;
            const creator = new SB3Creator();
            creator.parse(this.state.code);
            const missing = [];
            this.state.uploads.forEach(u => {
                const name = (u.sprite || '').trim();
                if (!name || !u.svg) return;
                const ok = u.mode === 'add' ?
                    creator.addCustomSVGCostume(name, u.svg, u.filename.replace(/\.svg$/i, '')) :
                    creator.applyCustomSVG(name, u.svg);
                if (!ok) missing.push(name);
            });
            const blob = await creator.generateSB3();
            const buffer = await blob.arrayBuffer();
            await this.props.vm.loadProject(buffer);
            const first = this.props.vm.runtime.targets.find(target => !target.isStage);
            if (first) this.props.vm.setEditingTarget(first.id);
            const warns = [...creator.warnings];
            if (missing.length) warns.push(`no sprite named: ${missing.join(', ')}`);
            this.setState({status: warns.length ?
                `Loaded with warnings — ${warns.slice(0, 4).join(' · ')}` :
                'Loaded into the editor. Switch to the Code tab to see the blocks.'});
        } catch (e) {
            this.setState({status: `Error: ${e.message}`});
        }
        this.setState({busy: false});
    }
    async fromBlocks () {
        this.setState({busy: true, status: 'Reading current project…'});
        try {
            const mod = await import(/* webpackChunkName: "sb3-creator" */ '../../lib/sb3-creator.js');
            const SB3Creator = mod.default;
            const project = JSON.parse(this.props.vm.toJSON());
            const code = new SB3Creator().decompile(project);
            const unsupported = (code.match(/^# unsupported:/gm) || []).length;
            this.setState({code, status: unsupported ?
                `Decompiled — ${unsupported} block(s) not representable in pseudocode (left as comments).` :
                'Decompiled the current project. Edit, then Compile & Load to apply.'});
        } catch (e) {
            this.setState({status: `Error: ${e.message}`});
        }
        this.setState({busy: false});
    }
    render () {
        const wrap = {height: '100%', boxSizing: 'border-box', padding: 16, overflow: 'auto',
            display: 'flex', flexDirection: 'column', font: '14px/1.5 sans-serif', color: '#575e75'};
        const btn = {padding: '10px 18px', borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer',
            fontWeight: 600, background: 'linear-gradient(135deg,#4c97ff,#4280d7)'};
        const sel = {padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', font: 'inherit'};
        return (
            <div style={wrap}>
                <div style={{marginBottom: 10}}>
                    <strong style={{fontSize: 16}}>Pseudocode → Project</strong>
                    <span style={{marginLeft: 10, opacity: .7}}>
                        Write pseudocode and compile it into blocks — or press “From blocks” to see the current project as code.
                    </span>
                </div>

                <div style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10}}>
                    <label style={{fontWeight: 600}}>Load an example:{' '}
                        <select defaultValue="" onChange={e => this.loadExample(e.target.value)} style={sel}>
                            <option value="" disabled>choose…</option>
                            {GROUPS.map(g => (
                                <optgroup key={g.label} label={g.label}>
                                    {g.items.filter(([k]) => examples[k]).map(([k, label]) => (
                                        <option key={k} value={k}>{label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </label>
                    <button onClick={() => this.setState(s => ({showRef: !s.showRef}))}
                        style={{...sel, cursor: 'pointer', background: '#f1f5f9'}}>
                        📝 {this.state.showRef ? 'Hide' : 'Show'} syntax reference
                    </button>
                </div>

                {this.state.showRef && (
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))',
                        gap: 12, marginBottom: 12, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0'}}>
                        {SYNTAX.map(([h, items]) => (
                            <div key={h}>
                                <div style={{fontWeight: 700, marginBottom: 4}}>{h}</div>
                                <ul style={{margin: 0, paddingLeft: 16}}>
                                    {items.map((it, i) => (
                                        <li key={i}><code style={{fontSize: 12}}>{it}</code></li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}

                <textarea
                    value={this.state.code}
                    onChange={e => this.setState({code: e.target.value})}
                    placeholder={'SPRITE Cat:\n  WHEN flag clicked:\n    say "Hello!" for 2 seconds\n    FOREVER:\n      move 10 steps\n      turn right 15 degrees'}
                    spellCheck={false}
                    style={{flex: 1, minHeight: 220, width: '100%', boxSizing: 'border-box', resize: 'vertical',
                        fontFamily: 'monospace', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 8, padding: 12}}
                />

                <details style={{margin: '12px 0 4px'}}>
                    <summary style={{cursor: 'pointer', fontWeight: 600}}>🖼️ Custom sprite art (upload SVG)</summary>
                    <p style={{margin: '8px 0'}}>
                        Upload one or more <code>.svg</code> files, then type the name of a sprite that
                        appears in your pseudocode (e.g. <code>Player</code> for <code>SPRITE Player:</code>).
                        On <strong>Compile &amp; Load</strong>, each SVG is baked in as that sprite&apos;s
                        costume — <em>replace</em> swaps its costume, <em>add as frame</em> appends one for animation.
                    </p>
                    <input type="file" accept=".svg,image/svg+xml" multiple onChange={this.handleFiles} />
                    {this.state.uploads.map((u, i) => (
                        <div key={i} style={{display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0'}}>
                            <img src={`data:image/svg+xml,${encodeURIComponent(u.svg)}`} alt=""
                                style={{width: 36, height: 36, objectFit: 'contain', background: '#fff',
                                    border: '1px solid #e2e8f0', borderRadius: 6}} />
                            <input placeholder="sprite name" value={u.sprite}
                                onChange={e => this.setUpload(i, {sprite: e.target.value})}
                                style={{padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', width: 120}} />
                            <select value={u.mode} onChange={e => this.setUpload(i, {mode: e.target.value})}
                                style={{padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1'}}>
                                <option value="replace">replace costume</option>
                                <option value="add">add as frame</option>
                            </select>
                            <span style={{flex: 1, opacity: .6, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis'}}>{u.filename}</span>
                            <button onClick={() => this.removeUpload(i)}
                                style={{border: 'none', background: 'none', cursor: 'pointer', fontSize: 16}}>✕</button>
                        </div>
                    ))}
                </details>

                <div style={{marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
                    <button onClick={this.compile} disabled={this.state.busy || !this.state.code.trim()} style={btn}>
                        🚀 Compile &amp; Load
                    </button>
                    <button onClick={this.fromBlocks} disabled={this.state.busy}
                        style={{...btn, background: 'linear-gradient(135deg,#a55b80,#8e4a6c)'}}>
                        ⟵ From blocks
                    </button>
                    {this.state.status ? <span style={{fontSize: 13}}>{this.state.status}</span> : null}
                </div>
            </div>
        );
    }
}

PseudocodeImporter.propTypes = {
    vm: PropTypes.shape({loadProject: PropTypes.func, toJSON: PropTypes.func}).isRequired
};

export default connect(state => ({vm: state.scratchGui.vm}))(PseudocodeImporter);
