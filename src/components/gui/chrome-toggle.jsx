import React from 'react';
import PropTypes from 'prop-types';

/**
 * Collapse the editor's two top rows into one strip.
 *
 * Slice 1 of `sb3-creator/reference/gui-layout.md`, and deliberately the whole of
 * it: one boolean and some CSS, no layout model, no reducer, nothing for a later
 * slice to unpick. The menu bar and the tab row together eat about 80px of a
 * laptop screen, which is a quarter of the block workspace on a 13".
 *
 * Two rules the design note sets, and this obeys both:
 *
 * 1. **Collapsing removes permanence, never capability.** Collapsed, the menu bar
 *    is one click away rather than gone, and the tabs keep their icons — you can
 *    still reach every tab and every menu without expanding. If something were
 *    only reachable expanded, it would not belong in the chrome at all.
 * 2. **No "reset layout" anywhere.** The same control put it away and brings it
 *    back, and it is the only control involved.
 *
 * The state is a class on `<body>` rather than redux: it is presentation with no
 * bearing on the project or the VM, every consumer of it is a stylesheet, and a
 * reducer would mean threading a prop through five components that have no other
 * reason to know. It persists in localStorage because a person who wants the
 * space back wants it back tomorrow too — and it is read once, synchronously,
 * before first paint, so the chrome never flashes open and then shut.
 */

const KEY = 'bw:compact-chrome';
const CLASS = 'bw-compact-chrome';

/** Read and apply before React mounts, so there is no flash of the tall chrome. */
export const applyStoredChrome = () => {
    try {
        if (localStorage.getItem(KEY) === '1') document.body.classList.add(CLASS);
    } catch { /* private mode: the default (expanded) is the safe one */ }
};

class ChromeToggle extends React.Component {
    constructor (props) {
        super(props);
        this.state = {compact: typeof document !== 'undefined' &&
            document.body.classList.contains(CLASS)};
        this.toggle = this.toggle.bind(this);
    }

    toggle () {
        const compact = !this.state.compact;
        document.body.classList.toggle(CLASS, compact);
        try { localStorage.setItem(KEY, compact ? '1' : '0'); } catch { /* fine */ }
        this.setState({compact});
        // Blockly measures its own canvas on resize and not otherwise, so a chrome
        // change that alters the height has to be announced or the workspace keeps
        // the old one and the blocks sit under the strip.
        window.dispatchEvent(new Event('resize'));
    }

    render () {
        const {compact} = this.state;
        return (
            <button
                aria-pressed={compact}
                className={this.props.className}
                title={compact
                    ? 'Show the menu bar and tab labels'
                    : 'Collapse the menu bar and tabs into one strip'}
                onClick={this.toggle}
            >
                {/* Three dots when there is something folded away, a chevron when
                    there is something to fold: the glyph says what the click does. */}
                <span aria-hidden="true">{compact ? '⋯' : '⌃'}</span>
            </button>
        );
    }
}

ChromeToggle.propTypes = {
    className: PropTypes.string
};

export default ChromeToggle;
