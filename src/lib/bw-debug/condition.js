/**
 * "Pause here when counter > 10" — the condition on a pause point.
 *
 * ## Why this is a parser and not `eval`
 *
 * The obvious implementation is `new Function('counter', 'return ' + expr)`.
 * That would run arbitrary code from a project file with full page access, in
 * an editor whose whole point is that children load each other's projects. A
 * condition is a comparison between a variable and a number; nothing about it
 * needs a programming language. So this parses a grammar small enough to read
 * in one sitting and evaluates it directly.
 *
 *     condition := comparison (('and' | 'or') comparison)*
 *     comparison := operand op operand
 *     operand   := <variable name> | <number>
 *     op        := > | < | >= | <= | = | == | != | <>
 *
 * `=` means equals, because that is what a Scratch user writes; `==` is
 * accepted too rather than being a trap.
 *
 * ## What it deliberately cannot do
 *
 * No arithmetic, no parentheses, no function calls. If someone needs
 * `counter * 2 > limit` they can add a variable — and a condition that needs
 * arithmetic is usually better expressed as one. The limit is stated in the UI
 * rather than discovered by a silent wrong answer: an expression this cannot
 * parse is REJECTED with the reason, never quietly treated as true (which
 * would pause every time) or as false (which would pause never, and look like
 * a broken breakpoint).
 *
 * @module
 */

const OPS = {
    '>=': (a, b) => a >= b,
    '<=': (a, b) => a <= b,
    '!=': (a, b) => a !== b,
    '<>': (a, b) => a !== b,
    '==': (a, b) => a === b,
    '=': (a, b) => a === b,
    '>': (a, b) => a > b,
    '<': (a, b) => a < b
};

// Longest first, so `>=` is not read as `>` followed by a stray `=`.
const OP_ORDER = ['>=', '<=', '!=', '<>', '==', '=', '>', '<'];

/**
 * @typedef {object} Condition
 * @property {(vars: Record<string, number>) => boolean} test
 * @property {string} source
 */

/**
 * Parse a condition.
 *
 * @param {string} source
 * @returns {Condition | {error: string}}
 */
export function parseCondition(source) {
    const text = String(source || '').trim();
    if (!text) return { error: 'empty condition' };

    // Split on `and` / `or` as whole words, keeping the joiners.
    const parts = text.split(/\s+(and|or)\s+/i);
    const clauses = [];
    const joiners = [];
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 1) { joiners.push(parts[i].toLowerCase()); continue; }
        const clause = parseComparison(parts[i]);
        if (clause.error) return clause;
        clauses.push(clause);
    }

    return {
        source: text,
        /** The variables this mentions, so a caller can warn about typos. */
        names: clauses.flatMap((c) => c.names),
        test(vars) {
            let result = clauses[0].test(vars);
            for (let i = 0; i < joiners.length; i++) {
                const next = clauses[i + 1].test(vars);
                result = joiners[i] === 'and' ? (result && next) : (result || next);
            }
            return result;
        }
    };
}

function parseComparison(text) {
    const clause = text.trim();
    for (const op of OP_ORDER) {
        const at = clause.indexOf(op);
        if (at <= 0) continue;
        const left = clause.slice(0, at).trim();
        const right = clause.slice(at + op.length).trim();
        const l = parseOperand(left);
        const r = parseOperand(right);
        if (l.error) return l;
        if (r.error) return r;
        const names = [l, r].filter((o) => o.name).map((o) => o.name);
        return {
            names,
            test(vars) {
                const a = l.name ? valueOf(vars, l.name) : l.value;
                const b = r.name ? valueOf(vars, r.name) : r.value;
                // An unknown name makes the whole comparison false rather than
                // throwing: the variable may simply not exist in this build,
                // and a pause point that explodes is worse than one that
                // never fires. The UI warns about unknown names separately.
                if (a === null || b === null) return false;
                return OPS[op](a, b);
            }
        };
    }
    return { error: `no comparison in "${clause}" — try  counter > 10` };
}

function parseOperand(text) {
    if (/^-?\d+$/.test(text)) return { value: Number(text) };
    if (/^[A-Za-z_][\w ]*$/.test(text)) return { name: text.trim() };
    return { error: `"${text}" is neither a number nor a variable name` };
}

function valueOf(vars, name) {
    const v = vars[name];
    return typeof v === 'number' ? v : null;
}
