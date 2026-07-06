import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import examples from '../../lib/sb3-creator-examples.js';
import brickRobot from './brick-robot.svg';

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

// Web Worker bodies for the sandboxed (non-interactive) runner. They run off the
// main thread so a runaway/`forever` loop can be `terminate()`d on a timeout instead
// of freezing the tab. Neither has a real `prompt`/`input` — interactive programs take
// the main-thread path instead. Kept as plain-ES5 strings so they need no transpile.
const JS_WORKER = [
    'self.onmessage = function (e) {',
    '  var log = function () {',
    '    var a = Array.prototype.slice.call(arguments);',
    '    self.postMessage({type: "out", text: a.map(function (x) {',
    '      return typeof x === "string" ? x : JSON.stringify(x);',
    '    }).join(" ") + "\\n"});',
    '  };',
    '  var console = {log: log, error: log, warn: log, info: log};',
    '  var prompt = function () { return ""; };',
    '  try {',
    '    (new Function("console", "prompt", e.data.code))(console, prompt);',
    '    self.postMessage({type: "done"});',
    '  } catch (err) { self.postMessage({type: "error", text: String(err && err.message || err)}); }',
    '};'
].join('\n');

// Appended after the injected Skulpt sources to form the Python worker.
const PY_WORKER = [
    'self.onmessage = function (e) {',
    '  Sk.configure({',
    '    output: function (t) { self.postMessage({type: "out", text: t}); },',
    '    read: function (f) {',
    '      if (Sk.builtinFiles && Sk.builtinFiles.files[f]) return Sk.builtinFiles.files[f];',
    '      throw new Error("module " + f + " not found");',
    '    },',
    '    inputfun: function () { return ""; },',
    '    inputfunTakesPrompt: true,',
    '    __future__: Sk.python3',
    '  });',
    '  Sk.misceval.asyncToPromise(function () {',
    '    return Sk.importMainWithBody("<brickwright>", false, e.data.code, true);',
    '  }).then(function () { self.postMessage({type: "done"}); })',
    '    .catch(function (err) { self.postMessage({type: "error", text: String(err && err.message || err)}); });',
    '};'
].join('\n');

class PseudocodeImporter extends React.Component {
    constructor (props) {
        super(props);
        this.state = {code: '', uploads: [], status: '', busy: false, showRef: false, lang: 'pseudocode', output: null};
        this.handleFiles = this.handleFiles.bind(this);
        this.compile = this.compile.bind(this);
        this.fromBlocks = this.fromBlocks.bind(this);
        this.loadExample = this.loadExample.bind(this);
        this.run = this.run.bind(this);
    }

    // Lazily fetch the prebuilt Skulpt sources (~1 MB, only on the first Python
    // run) and cache the raw strings so both the main-thread injector and the
    // Worker builder can reuse them.
    async skulptSource () {
        if (this._skSrc) return this._skSrc;
        const [core, stdlib] = await Promise.all([
            import(/* webpackChunkName: "skulpt" */ '!!raw-loader!skulpt/dist/skulpt.min.js'),
            import(/* webpackChunkName: "skulpt-stdlib" */ '!!raw-loader!skulpt/dist/skulpt-stdlib.js')
        ]);
        this._skSrc = {core: core.default || core, stdlib: stdlib.default || stdlib};
        return this._skSrc;
    }

    // Skulpt's dist assumes a global `Sk`, so on the main thread we inject it as a
    // <script> rather than importing it as a module.
    async loadSkulpt () {
        if (window.Sk && window.Sk.configure) return window.Sk;
        const {core, stdlib} = await this.skulptSource();
        const inject = (src) => { const s = document.createElement('script'); s.text = src; document.head.appendChild(s); };
        inject(core); inject(stdlib);
        if (!window.Sk || !window.Sk.configure) throw new Error('Skulpt failed to load');
        return window.Sk;
    }

    // Run `workerSrc` (a self-contained worker body) against `code` in a fresh Web
    // Worker, streaming its output into `buf`. Resolves {} on clean finish, {error}
    // on a thrown error, or {timeout:true} after `timeoutMs` — at which point the
    // worker (and any infinite loop inside it) is terminated. Never rejects.
    runViaWorker (workerSrc, code, buf, timeoutMs) {
        return new Promise((resolve) => {
            let url;
            let worker;
            try {
                url = URL.createObjectURL(new Blob([workerSrc], {type: 'application/javascript'}));
                worker = new Worker(url);
            } catch (e) {
                if (url) URL.revokeObjectURL(url);
                resolve({error: String((e && e.message) || e)});
                return;
            }
            let settled = false;
            const done = (result) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                worker.terminate();
                URL.revokeObjectURL(url);
                resolve(result);
            };
            const timer = setTimeout(() => done({timeout: true}), timeoutMs);
            worker.onmessage = (e) => {
                const d = e.data || {};
                if (d.type === 'out') buf.push(d.text);
                else if (d.type === 'done') done({});
                else if (d.type === 'error') done({error: d.text});
            };
            worker.onerror = (e) => done({error: (e && e.message) || 'worker error'});
            worker.postMessage({code});
        });
    }

    runJsMain (code, buf) {
        const log = (...a) => buf.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');
        // eslint-disable-next-line no-new-func
        const fn = new Function('console', 'prompt', code);
        fn({log, error: log, warn: log, info: log}, (q) => window.prompt(q) || '');
    }

    async runPyMain (code, buf) {
        const Sk = await this.loadSkulpt();
        Sk.configure({
            output: (t) => buf.push(t),
            read: (f) => { if (Sk.builtinFiles && Sk.builtinFiles.files[f]) return Sk.builtinFiles.files[f]; throw new Error(`module ${f} not found`); },
            inputfun: (p) => window.prompt(p) || '',
            inputfunTakesPrompt: true,
            __future__: Sk.python3
        });
        await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<brickwright>', false, code, true));
    }

    // Run the generated code in-page. Interactive programs (that read input) need
    // the synchronous main-thread `prompt()`, so they run inline with a forever-loop
    // guard. Everything else runs in a Web Worker with a hard timeout — a runaway
    // loop is killed cleanly instead of freezing the tab.
    async run () {
        const code = this.state.code;
        const lang = this.state.lang;
        const buf = [];
        this.setState({output: '', running: true, status: ''});
        const TIMEOUT = 4000;
        const finish = (extra) => this.setState({
            output: (buf.join('').trimEnd() + (extra ? (buf.length ? '\n' : '') + extra : '')).trim() || '(no output)',
            running: false, status: ''
        });
        const forever = lang === 'python' ? /^\s*while\s+True\s*:/m : /while\s*\(\s*true\s*\)/;
        const usesInput = lang === 'python' ? /(^|[^.\w])input\s*\(/.test(code) : /(^|[^.\w])prompt\s*\(/.test(code);
        const canWorker = typeof Worker !== 'undefined' && typeof Blob !== 'undefined' &&
            typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
        try {
            // A `forever:` game loop is meant for the blocks/green flag, not a text console —
            // catch the obvious case up front with a friendly nudge (the Worker timeout below
            // is only a safety net for non-obvious runaway loops).
            if (forever.test(code)) throw new Error('This project has a forever (game) loop, so it runs in the blocks — press the green flag to play it. For a text run, try an algorithmic example (quiz, operators, 2048, …).');
            if (usesInput || !canWorker) {
                if (lang === 'python') { this.setState({status: 'Loading Python (Skulpt)…'}); await this.runPyMain(code, buf); } else this.runJsMain(code, buf);
                finish();
            } else {
                let result;
                if (lang === 'python') {
                    this.setState({status: 'Loading Python (Skulpt)…'});
                    const {core, stdlib} = await this.skulptSource();
                    result = await this.runViaWorker(`${core}\n${stdlib}\n${PY_WORKER}`, code, buf, TIMEOUT);
                } else {
                    result = await this.runViaWorker(JS_WORKER, code, buf, TIMEOUT);
                }
                if (result.timeout) finish(`⏱ Stopped after ${TIMEOUT / 1000}s — still running (likely an infinite loop).`);
                else if (result.error) finish(result.error);
                else finish();
            }
        } catch (e) {
            finish(String(e.message || e));
        }
    }
    loadExample (key) {
        if (key && examples[key]) this.setState({code: examples[key], status: `Loaded example: ${key}`});
    }
    // Sprite names declared in the current pseudocode — used to populate the
    // "associate SVG → sprite" dropdowns so you pick a real sprite, not guess a name.
    spriteNames () {
        const names = [];
        const re = /^\s*SPRITE\s+([^\s:]+)/gm;
        let m;
        while ((m = re.exec(this.state.code)) !== null) names.push(m[1]);
        return names;
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
            const gen = new SB3Creator();
            const lang = this.state.lang;
            let code, status;
            if (lang === 'python') {
                code = gen.generatePython(project);
                status = 'Python — a read-only view of the current project (the algorithmic parts run).';
            } else if (lang === 'javascript') {
                code = gen.generateJavaScript(project);
                status = 'JavaScript — a read-only view of the current project (the algorithmic parts run).';
            } else {
                code = gen.decompile(project);
                const unsupported = (code.match(/^# unsupported:/gm) || []).length;
                status = unsupported ?
                    `Decompiled — ${unsupported} block(s) not representable in pseudocode (left as comments).` :
                    'Decompiled the current project. Edit, then Compile & Load to apply.';
            }
            this.setState({code, status});
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
                <div style={{marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12}}>
                    <img src={brickRobot} alt="Brickwright mascot" width={44} height={52} draggable={false} />
                    <div>
                        <strong style={{fontSize: 16}}>Brickwright Script</strong>
                        <div style={{opacity: .7}}>
                            Write your project as plain code and compile it into blocks — or press “From blocks”
                            to read the current project back as code. The same language drives Bricks &amp; robots.
                        </div>
                    </div>
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
                        Upload one or more <code>.svg</code> files, then associate each with a sprite from your
                        pseudocode in the table below. On <strong>Compile &amp; Load</strong>, every SVG is baked
                        in as that sprite&apos;s costume — <em>replace</em> swaps its costume, <em>add as frame</em>
                        appends one for animation.
                    </p>
                    <input type="file" accept=".svg,image/svg+xml" multiple onChange={this.handleFiles} />
                    {this.state.uploads.length > 0 && (() => {
                        const sprites = this.spriteNames();
                        const th = {textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #e2e8f0', fontSize: 12, opacity: .75};
                        const td = {padding: '6px 8px', borderBottom: '1px solid #eef2f7', verticalAlign: 'middle'};
                        return (
                            <table style={{borderCollapse: 'collapse', width: '100%', marginTop: 10}}>
                                <thead><tr>
                                    <th style={th}>SVG file</th>
                                    <th style={th}>Sprite</th>
                                    <th style={th}>Mode</th>
                                    <th style={th} />
                                </tr></thead>
                                <tbody>
                                    {this.state.uploads.map((u, i) => (
                                        <tr key={i}>
                                            <td style={td}>
                                                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                                    <img src={`data:image/svg+xml,${encodeURIComponent(u.svg)}`} alt=""
                                                        style={{width: 36, height: 36, objectFit: 'contain', background: '#fff',
                                                            border: '1px solid #e2e8f0', borderRadius: 6, flexShrink: 0}} />
                                                    <span style={{fontSize: 12, opacity: .7, wordBreak: 'break-all'}}>{u.filename}</span>
                                                </div>
                                            </td>
                                            <td style={td}>
                                                <select value={u.sprite} onChange={e => this.setUpload(i, {sprite: e.target.value})}
                                                    style={{padding: '4px 8px', borderRadius: 6,
                                                        border: `1px solid ${u.sprite ? '#cbd5e1' : '#f0a0a0'}`, minWidth: 130}}>
                                                    <option value="">— choose sprite —</option>
                                                    {sprites.map(n => <option key={n} value={n}>{n}</option>)}
                                                    {u.sprite && !sprites.includes(u.sprite) &&
                                                        <option value={u.sprite}>{u.sprite} (not in code)</option>}
                                                </select>
                                            </td>
                                            <td style={td}>
                                                <select value={u.mode} onChange={e => this.setUpload(i, {mode: e.target.value})}
                                                    style={{padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1'}}>
                                                    <option value="replace">replace costume</option>
                                                    <option value="add">add as frame</option>
                                                </select>
                                            </td>
                                            <td style={td}>
                                                <button onClick={() => this.removeUpload(i)}
                                                    style={{border: 'none', background: 'none', cursor: 'pointer', fontSize: 16}}>✕</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    })()}
                    {this.state.uploads.length > 0 && this.spriteNames().length === 0 && (
                        <p style={{margin: '8px 0 0', fontSize: 12, color: '#b45309'}}>
                            No <code>SPRITE</code> declarations found in your pseudocode yet — add one (e.g.
                            <code> SPRITE Player:</code>) to associate an SVG with it.
                        </p>
                    )}
                </details>

                <div style={{marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
                    <button onClick={this.compile}
                        disabled={this.state.busy || !this.state.code.trim() || this.state.lang !== 'pseudocode'}
                        title={this.state.lang !== 'pseudocode' ? 'Switch the “From blocks” language to Pseudocode to edit & compile' : ''}
                        style={btn}>
                        🚀 Compile &amp; Load
                    </button>
                    <button onClick={this.fromBlocks} disabled={this.state.busy}
                        style={{...btn, background: 'linear-gradient(135deg,#a55b80,#8e4a6c)'}}>
                        ⟵ From blocks
                    </button>
                    <label style={{fontSize: 13}}>as{' '}
                        <select value={this.state.lang}
                            onChange={e => this.setState({lang: e.target.value, output: null})}
                            style={{padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', font: 'inherit'}}>
                            <option value="pseudocode">Pseudocode (editable)</option>
                            <option value="python">Python (read-only)</option>
                            <option value="javascript">JavaScript (read-only)</option>
                        </select>
                    </label>
                    {this.state.lang !== 'pseudocode' && this.state.code.trim() ? (
                        <button onClick={this.run} disabled={this.state.running}
                            style={{...btn, background: 'linear-gradient(135deg,#37b24d,#2f9e44)'}}>
                            ▶ Run {this.state.lang === 'python' ? 'Python' : 'JS'}
                        </button>
                    ) : null}
                    {this.state.status ? <span style={{fontSize: 13}}>{this.state.status}</span> : null}
                </div>
                {this.state.output != null ? (
                    <pre style={{marginTop: 10, padding: 12, background: '#0c3a44', color: '#c7f0e0', borderRadius: 8,
                        fontFamily: 'monospace', fontSize: 13, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap'}}>
                        {this.state.output || '…'}
                    </pre>
                ) : null}
            </div>
        );
    }
}

PseudocodeImporter.propTypes = {
    vm: PropTypes.shape({loadProject: PropTypes.func, toJSON: PropTypes.func}).isRequired
};

export default connect(state => ({vm: state.scratchGui.vm}))(PseudocodeImporter);
