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
    ]},
    {label: 'Extensions', items: [
        ['planetemaths', '🧮 Planète Maths'], ['arrays', '📐 Arrays & Vectors']
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
    ['Planète Maths (extension)', ['factorial of 5', 'sum of digits of 123', 'min of a and b / max of a and b',
        '2 to the power of 8', 'pi, euler', 'x is multiple of 3']],
    ['Arrays & Vectors (extension)', ['new array "v" = [1,2,3]  (0-based)', 'new array "v" = range 1 to 5',
        'push x to array "v" / set item i of array "v" to x', 'item i of array "v" / sum of array "v"',
        'largest / smallest / length / mean of array "v"', 'array "v" contains x / array "v" as text']],
    ['Sensing & more', ['x position of Player', 'current year, day of week',
        'distance to mouse-pointer', 'set drag mode draggable', 'play note 60 for 0.5 beats, set tempo to 120']]
];

const LANG_LABEL = {pseudocode: 'Pseudocode', python: 'Python', javascript: 'JavaScript'};

// What the Python / JavaScript front-ends actually support (shown as the reference
// when those tabs are active, so you know what round-trips to blocks).
const SUPPORTED = {
    python: [
        ['Structure', ['def when_flag_clicked():', 'def do_myblock(a, b):', 'x = 0 / xs = []  (module state)', 'when_flag_clicked()  (run)']],
        ['Control', ['if / elif / else:', 'while cond:  →  repeat until', 'while True:  →  forever', 'for _ in range(n):', 'return  →  stop this script']],
        ['Statements', ['x = expr  /  x += expr', 'print(x)  →  say', 'x = input(p)  →  ask', 'xs.append/insert/clear', 'del xs[i-1]  /  xs[i-1] = v']],
        ['Expressions', ['+ - * / %,  a == b → =', 'and / or / not', '_eq(a, b) (loose =)', 'random.randint(a, b)', 'len(x), math.floor(x), str()/int()']]
    ],
    javascript: [
        ['Structure', ['function when_flag_clicked() {}', 'function do_myblock(a, b) {}', 'let x = 0;  let xs = [];', 'when_flag_clicked();  // run']],
        ['Control', ['if / else', 'while (cond)  →  repeat until', 'while (true)  →  forever', 'for (let i=0; i<n; i++)', 'return;  →  stop this script']],
        ['Statements', ['x = expr;  /  x += expr;', 'console.log(x)  →  say', 'prompt(p)  →  ask', 'xs.push/splice, xs.length', 'xs[i-1] = v']],
        ['Expressions', ['+ - * / %,  === → =', '&& / || / !', '_eq(a, b), _rand(a, b)', 'String()/Number()', 'Math.floor(x), arr[i-1]']]
    ]
};

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

// ---- Lightweight syntax highlighter (dependency-free, CSP-safe) ------------------
// A textarea can't render coloured text, so the editor is an overlay: a highlighted
// <pre> sits behind a transparent <textarea> whose caret stays visible. This function
// turns source into safe HTML for that <pre>. It's deliberately regex-simple —
// strings, comments, numbers and a per-language keyword set — not a full lexer.
const KEYWORDS = {
    python: /^(def|if|elif|else|while|for|in|return|pass|and|or|not|True|False|None|import|from|as|global|range|del|break|continue|lambda|with|try|except|is)$/,
    javascript: /^(function|if|else|while|for|of|in|return|let|const|var|true|false|null|undefined|new|typeof|do|switch|case|break|continue|try|catch|throw|class|this|void)$/,
    pseudocode: /^(set|change|say|think|ask|wait|move|turn|go|glide|point|broadcast|create|delete|stop|add|insert|replace|call|play|hide|show|switch|next|when|and|or|not|of|to|by|until|contains|mod|join|item|pick|random|round|sqrt|length|clone|myself)$/i
};
const PSEUDO_CAPS = /^(SPRITE|STAGE|GLOBAL|LOCAL|LIST|SHAPE|COSTUME|BACKDROP|SOUND|WHEN|DEFINE|IF|THEN|ELSE|FOREVER|REPEAT|UNTIL|FAST)$/;

function escHtml (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function highlight (code, lang) {
    const commentPat = lang === 'javascript' ? '\\/\\/[^\\n]*' : '#[^\\n]*';
    const re = new RegExp(`(${commentPat})|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_][A-Za-z0-9_]*)`, 'g');
    const kw = KEYWORDS[lang] || KEYWORDS.pseudocode;
    let out = '', last = 0, m;
    const wrap = (color, text, extra) => `<span style="color:${color}${extra || ''}">${escHtml(text)}</span>`;
    while ((m = re.exec(code))) {
        out += escHtml(code.slice(last, m.index));
        last = re.lastIndex;
        const [, comment, str, num, word] = m;
        if (comment !== undefined) out += wrap('#6a737d', comment, ';font-style:italic');
        else if (str !== undefined) out += wrap('#22863a', str);
        else if (num !== undefined) out += wrap('#005cc5', num);
        else if (word !== undefined) {
            if (lang === 'pseudocode' && PSEUDO_CAPS.test(word)) out += wrap('#6f42c1', word, ';font-weight:600');
            else if (kw.test(word)) out += wrap('#d73a49', word);
            else out += escHtml(word);
        }
    }
    out += escHtml(code.slice(last));
    return out;
}

// Overlaid highlighted editor. Shares exact metrics between the <pre> and <textarea>
// so the coloured layer lines up with the caret; scroll is mirrored on input/scroll.
class CodeEditor extends React.Component {
    constructor (props) {
        super(props);
        this.pre = React.createRef();
        this.ta = React.createRef();
        this.sync = this.sync.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }
    sync () { const pre = this.pre.current, ta = this.ta.current; if (pre && ta) { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; } }
    onKeyDown (e) {
        if (e.key !== 'Tab' || this.props.readOnly) return;
        e.preventDefault();
        const ta = e.target;
        const s = ta.selectionStart, en = ta.selectionEnd, val = ta.value;
        const next = val.slice(0, s) + '  ' + val.slice(en);
        this.props.onChange({target: {value: next}});
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
    }
    render () {
        const {value, onChange, readOnly, lang, placeholder} = this.props;
        const shared = {margin: 0, boxSizing: 'border-box', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
            fontSize: 13, lineHeight: '1.5', padding: 12, border: '1px solid #cbd5e1', borderRadius: 8,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word', tabSize: 2, letterSpacing: 'normal'};
        const html = value ? highlight(value, lang) + '<br/>' : `<span style="color:#94a3b8">${escHtml(placeholder || '')}</span>`;
        return (
            <div style={{position: 'relative', flex: 1, minHeight: 240, width: '100%'}}>
                <pre ref={this.pre} aria-hidden="true" dangerouslySetInnerHTML={{__html: html}}
                    style={{...shared, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'auto',
                        background: readOnly ? '#f8fafc' : '#fff', color: '#24292e', pointerEvents: 'none',
                        borderColor: readOnly ? '#e2e8f0' : '#cbd5e1'}} />
                <textarea ref={this.ta} value={value} onChange={onChange} onScroll={this.sync} onKeyDown={this.onKeyDown}
                    spellCheck={false} readOnly={readOnly}
                    style={{...shared, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, resize: 'none', overflow: 'auto',
                        background: 'transparent', color: 'transparent', caretColor: '#24292e', WebkitTextFillColor: 'transparent',
                        borderColor: 'transparent'}} />
            </div>
        );
    }
}
CodeEditor.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func,
    readOnly: PropTypes.bool,
    lang: PropTypes.string,
    placeholder: PropTypes.string
};

class PseudocodeImporter extends React.Component {
    constructor (props) {
        super(props);
        // One buffer per language tab. Editing the active tab clears the others so
        // switching tabs always re-derives them from the latest edit — you can never
        // end up with (say) pseudocode sitting in the Python tab.
        this.state = {lang: 'pseudocode', buffers: {pseudocode: '', python: '', javascript: ''},
            uploads: [], status: '', busy: false, showRef: false, showInfo: false, showArt: false, output: null, running: false,
            // Hardware-extension codegen options (see reference/runtime-drivers.md): the emitted
            // driver (shim / remote / on-brick), plus async/await and event-hat switches.
            driverMode: 'shim', asyncMode: false, eventsMode: false};
        this.handleFiles = this.handleFiles.bind(this);
        this.compile = this.compile.bind(this);
        this.fromBlocks = this.fromBlocks.bind(this);
        this.loadExample = this.loadExample.bind(this);
        this.run = this.run.bind(this);
        this.switchTab = this.switchTab.bind(this);
    }

    activeCode () { return this.state.buffers[this.state.lang]; }
    setActiveCode (text) { this.setState(s => ({buffers: {pseudocode: '', python: '', javascript: '', [s.lang]: text}})); }

    // Lazily import the compiler module.
    async lib () { return (await import(/* webpackChunkName: "sb3-creator" */ '../../lib/sb3-creator.js')); }

    // Convert one language's source to another by going through blocks:
    // source → pseudocode → parse() → project → generate(to). Returns {code} or {error}.
    async deriveBuffer (src, from, to) {
        try {
            const SB3 = (await this.lib()).default;
            let pseudo = src;
            if (from === 'python') pseudo = (await import(/* webpackChunkName: "sb3-creator-python" */ '../../lib/sb3-creator-python.js')).default(src).pseudocode;
            else if (from === 'javascript') pseudo = (await import(/* webpackChunkName: "sb3-creator-javascript" */ '../../lib/sb3-creator-javascript.js')).default(src).pseudocode;
            const creator = new SB3();
            creator.parse(pseudo);
            const proj = creator.project;
            let code;
            if (to === 'pseudocode') code = new SB3().decompile(proj);
            else if (to === 'python') code = new SB3().generatePython(proj, this.genOpts());
            else code = new SB3().generateJavaScript(proj, this.genOpts());
            return {code};
        } catch (e) { return {error: e.message}; }
    }

    // Switch language tab. If the target buffer is empty, derive it from the active
    // buffer so the tab shows the same project in the new language.
    switchTab (to) {
        const from = this.state.lang;
        if (to === from || this.state.busy) return;
        const existing = this.state.buffers[to];
        const src = this.state.buffers[from];
        if ((existing && existing.trim()) || !src || !src.trim()) { this.setState({lang: to, output: null, status: ''}); return; }
        this.setState({busy: true, status: `Converting to ${to}…`});
        this.deriveBuffer(src, from, to).then(({code, error}) => {
            if (error) { this.setState({busy: false, status: `Can't show as ${to}: ${error}`}); return; }
            this.setState(s => ({lang: to, busy: false, output: null, status: '', buffers: {...s.buffers, [to]: code}}));
        });
    }

    // Hardware-extension codegen options passed to generatePython/generateJavaScript.
    genOpts () { return {driver: this.state.driverMode, async: this.state.asyncMode, events: this.state.eventsMode}; }

    // Apply a codegen-option change and regenerate the active code view.
    setGenOpt (patch) {
        this.setState(patch, () => {
            const src = this.state.buffers.pseudocode;
            if (this.state.lang === 'pseudocode' || !src || !src.trim()) return;
            this.setState({busy: true, status: 'Regenerating…'});
            this.deriveBuffer(src, 'pseudocode', this.state.lang).then(({code, error}) => {
                if (error) { this.setState({busy: false, status: error}); return; }
                this.setState(s => ({busy: false, status: '', output: null, buffers: {...s.buffers, [s.lang]: code}}));
            });
        });
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
        const code = this.activeCode();
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
        if (key && examples[key]) this.setState({lang: 'pseudocode', output: null, status: '',
            buffers: {pseudocode: examples[key], python: '', javascript: ''}});
    }
    // Sprite names declared in the current pseudocode — used to populate the
    // "associate SVG → sprite" dropdowns so you pick a real sprite, not guess a name.
    spriteNames () {
        const src = this.state.lang === 'pseudocode' ? this.activeCode() : this.state.buffers.pseudocode;
        const names = [];
        const re = /^\s*SPRITE\s+([^\s:]+)/gm;
        let m;
        while ((m = re.exec(src || '')) !== null) names.push(m[1]);
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
    // Compile the active tab's code to blocks. Python/JavaScript go through their
    // parser to pseudocode first. After loading, the other two tabs are regenerated
    // from the compiled project so all three stay consistent.
    async compile () {
        const lang = this.state.lang;
        this.setState({busy: true, status: 'Compiling…'});
        try {
            let source = this.activeCode();
            let parseWarnings = [];
            if (lang === 'python') {
                const res = (await import(/* webpackChunkName: "sb3-creator-python" */ '../../lib/sb3-creator-python.js')).default(source);
                source = res.pseudocode; parseWarnings = res.warnings || [];
            } else if (lang === 'javascript') {
                const res = (await import(/* webpackChunkName: "sb3-creator-javascript" */ '../../lib/sb3-creator-javascript.js')).default(source);
                source = res.pseudocode; parseWarnings = res.warnings || [];
            }
            const SB3Creator = (await this.lib()).default;
            const creator = new SB3Creator();
            creator.parse(source);
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
            await this.props.vm.loadProject(await blob.arrayBuffer());
            const first = this.props.vm.runtime.targets.find(target => !target.isStage);
            if (first) this.props.vm.setEditingTarget(first.id);
            // regenerate the other tabs from the compiled project
            const proj = creator.project;
            const nb = {...this.state.buffers};
            if (lang !== 'pseudocode') nb.pseudocode = new SB3Creator().decompile(proj);
            if (lang !== 'python') nb.python = new SB3Creator().generatePython(proj, this.genOpts());
            if (lang !== 'javascript') nb.javascript = new SB3Creator().generateJavaScript(proj, this.genOpts());
            const warns = [...parseWarnings, ...creator.warnings];
            if (missing.length) warns.push(`no sprite named: ${missing.join(', ')}`);
            this.setState({buffers: nb, status: warns.length ?
                `Loaded with warnings — ${warns.slice(0, 4).join(' · ')}` :
                'Compiled to blocks and loaded. Switch to the Code tab to see them.'});
        } catch (e) {
            this.setState({status: `Error: ${e.message}`});
        }
        this.setState({busy: false});
    }
    // Read the running project into all three languages at once.
    async fromBlocks () {
        this.setState({busy: true, status: 'Reading current project…'});
        try {
            const SB3Creator = (await this.lib()).default;
            const project = JSON.parse(this.props.vm.toJSON());
            const buffers = {
                pseudocode: new SB3Creator().decompile(project),
                python: new SB3Creator().generatePython(project, this.genOpts()),
                javascript: new SB3Creator().generateJavaScript(project, this.genOpts())
            };
            const unsupported = (buffers.pseudocode.match(/^# unsupported:/gm) || []).length;
            this.setState({buffers, output: null, status: unsupported ?
                `Read into all three languages — ${unsupported} block(s) not representable in pseudocode (left as comments).` :
                'Read the current project into all three languages. Edit any of them, then “To blocks”.'});
        } catch (e) {
            this.setState({status: `Error: ${e.message}`});
        }
        this.setState({busy: false});
    }
    render () {
        // The selected .tab-panel is display:flex (row); like .blocks-wrapper we must
        // flex-grow to fill the column width, else we shrink to content (~660px) and
        // leave a big gap before the stage.
        const wrap = {height: '100%', flex: '1 1 auto', minWidth: 0, boxSizing: 'border-box', padding: 16, overflow: 'auto',
            display: 'flex', flexDirection: 'column', font: '14px/1.5 sans-serif', color: '#575e75'};
        const btn = {padding: '10px 18px', borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer',
            fontWeight: 600, background: 'linear-gradient(135deg,#4c97ff,#4280d7)'};
        const sel = {padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', font: 'inherit'};
        return (
            <div style={wrap}>
                {/* One compact row: mascot · title · info tooltip · example loader · reference toggle */}
                <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10}}>
                    <img src={brickRobot} alt="Brickwright mascot" width={28} height={33} draggable={false} />
                    <strong style={{fontSize: 15}}>Brickwright Code</strong>
                    <button type="button" onClick={() => this.setState(s => ({showInfo: !s.showInfo}))}
                        aria-label="About the Code tab" title="Click for info"
                        style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18,
                            padding: 0, border: 'none', borderRadius: '50%', background: this.state.showInfo ? '#4c97ff' : '#e2e8f0',
                            color: this.state.showInfo ? '#fff' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontStyle: 'italic'}}>
                        i
                    </button>
                    <span style={{flex: 1}} />
                    <select defaultValue="" onChange={e => this.loadExample(e.target.value)} style={sel} title="Load a built-in example">
                        <option value="" disabled>📚 Load example…</option>
                        {GROUPS.map(g => (
                            <optgroup key={g.label} label={g.label}>
                                {g.items.filter(([k]) => examples[k]).map(([k, label]) => (
                                    <option key={k} value={k}>{label}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    <button onClick={() => this.setState(s => ({showRef: !s.showRef}))}
                        style={{...sel, cursor: 'pointer', background: this.state.showRef ? '#e2e8f0' : '#f1f5f9'}}
                        title={`Reference for ${this.state.lang}`}>
                        📝 {LANG_LABEL[this.state.lang]} reference
                    </button>
                </div>

                {this.state.showInfo && (
                    <div style={{marginBottom: 10, padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
                        borderRadius: 8, fontSize: 13, color: '#334155'}}>
                        Write your project as <strong>Pseudocode</strong>, <strong>Python</strong>, or <strong>JavaScript</strong> —
                        all three are two-way. <strong>⇦ To blocks</strong> compiles the active tab; <strong>From blocks ⇨</strong>{' '}
                        reads the current project into every language. Switching tabs converts between them. Sprite/pen behaviour
                        lives in the blocks (the ground truth), so the code tabs show the algorithmic parts — comments are kept.
                    </div>
                )}

                {this.state.showRef && (
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))',
                        gap: 12, marginBottom: 12, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0'}}>
                        {(this.state.lang === 'pseudocode' ? SYNTAX : SUPPORTED[this.state.lang]).map(([h, items]) => (
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

                {/* Tabs (left) + Custom-art toggle (right). Plain buttons — NOT role="tab",
                    which would collide with the editor's top-level react-tabs. */}
                <div style={{display: 'flex', gap: 2, marginBottom: -1, alignItems: 'flex-end'}}>
                    {[['pseudocode', '🧩 Pseudocode'], ['python', '🐍 Python'], ['javascript', '🟨 JavaScript']].map(([l, label]) => {
                        const active = this.state.lang === l;
                        return (
                            <button key={l} type="button" aria-pressed={active} onClick={() => this.switchTab(l)}
                                disabled={this.state.busy && !active}
                                style={{padding: '8px 16px', border: '1px solid #cbd5e1', borderBottom: active ? '1px solid #fff' : '1px solid #cbd5e1',
                                    borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: active ? 700 : 500,
                                    background: active ? '#fff' : '#eef2f7', color: active ? '#1e293b' : '#64748b',
                                    position: 'relative', top: active ? 0 : 1}}>
                                {label}
                            </button>
                        );
                    })}
                    <span style={{flex: 1}} />
                    <button type="button" onClick={() => this.setState(s => ({showArt: !s.showArt}))}
                        title="Upload SVGs and bake them in as sprite costumes"
                        style={{alignSelf: 'center', padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                            border: '1px solid #cbd5e1', background: this.state.showArt ? '#e2e8f0' : '#f1f5f9', fontSize: 13}}>
                        🖼️ Custom sprite art{this.state.uploads.length ? ` (${this.state.uploads.length})` : ''}
                    </button>
                </div>
                <CodeEditor
                    value={this.activeCode()}
                    onChange={e => this.setActiveCode(e.target.value)}
                    readOnly={false}
                    lang={this.state.lang}
                    placeholder={this.state.lang === 'pseudocode'
                        ? 'SPRITE Cat:\n  WHEN flag clicked:\n    say "Hello!" for 2 seconds\n    FOREVER:\n      move 10 steps'
                        : this.state.lang === 'python'
                            ? 'def when_flag_clicked():\n    print("Hello!")\n\nwhen_flag_clicked()\n\n# or press “From blocks” to generate this from your project'
                            : 'function when_flag_clicked() {\n  console.log("Hello!");\n}\nwhen_flag_clicked();\n\n// or press “From blocks” to generate this from your project'}
                />

                {this.state.showArt && (
                <div style={{margin: '12px 0 4px', padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8}}>
                    <p style={{margin: '0 0 8px'}}>
                        Upload one or more <code>.svg</code> files, then associate each with a sprite from your
                        pseudocode in the table below. On <strong>⇦ To blocks</strong>, every SVG is baked
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
                </div>
                )}

                <div style={{marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
                    <button onClick={this.compile}
                        disabled={this.state.busy || !this.activeCode().trim()}
                        title={`Compile this ${LANG_LABEL[this.state.lang]} into blocks`}
                        style={btn}>
                        ⇦ To blocks
                    </button>
                    <button onClick={this.fromBlocks} disabled={this.state.busy}
                        title="Read the current blocks back into all three languages"
                        style={{...btn, background: 'linear-gradient(135deg,#a55b80,#8e4a6c)'}}>
                        From blocks ⇨
                    </button>
                    {this.state.lang !== 'pseudocode' && /_[a-z]+\.|Driver/.test(this.activeCode()) ? (
                        <span style={{fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8}}>
                            <label title="Hardware-extension driver: shim (neutral) · remote (bridge over WebSocket) · on-brick (device transpiler). The program is driver-agnostic; this only swaps the driver.">
                                🔌{' '}
                                <select value={this.state.driverMode} onChange={e => this.setGenOpt({driverMode: e.target.value})} disabled={this.state.busy}
                                    style={{padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', font: 'inherit'}}>
                                    <option value="shim">driver: shim</option>
                                    <option value="remote">driver: remote (bridge)</option>
                                    <option value="ondevice">driver: on-brick</option>
                                </select>
                            </label>
                            <label title="await hardware calls (BLE is async) and make functions async">
                                <input type="checkbox" checked={this.state.asyncMode} disabled={this.state.busy}
                                    onChange={e => this.setGenOpt({asyncMode: e.target.checked})} /> async
                            </label>
                            <label title="turn extension event hats (when button pressed …) into driver callbacks">
                                <input type="checkbox" checked={this.state.eventsMode} disabled={this.state.busy}
                                    onChange={e => this.setGenOpt({eventsMode: e.target.checked})} /> events
                            </label>
                        </span>
                    ) : null}
                    {this.state.lang !== 'pseudocode' && this.activeCode().trim() ? (
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
