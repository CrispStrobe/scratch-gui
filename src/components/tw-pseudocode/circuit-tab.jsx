import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

/**
 * The circuit designer, as a first-class editor tab beside Code / Costumes / Sounds.
 *
 * It began life as a toggle inside the Code tab and that was the wrong home: a board
 * you wire by dragging parts needs the whole editor pane, not a strip under a textarea.
 *
 * Two things this has to get right:
 *
 * 1. `forceRenderTabPanel` is set on the GUI's <Tabs>, so this component is mounted from
 *    the moment the editor opens, whether or not anyone ever looks at the tab. The engine
 *    and the panel are therefore loaded on first *visibility*, not on mount — otherwise
 *    every user pays for a designer most of them never open.
 * 2. The board is inferred from the project's PIN declarations (boundary C), so it is
 *    re-read each time the tab is opened; the user may well have edited the declarations
 *    in the Code tab in between.
 */
class CircuitTab extends React.Component {
    constructor (props) {
        super(props);
        this.state = {Designer: null, error: null, stc: null};
    }

    componentDidMount () {
        if (this.props.isVisible) this.load();
    }

    componentDidUpdate (prevProps) {
        if (this.props.isVisible && !prevProps.isVisible) this.load();
    }

    async load () {
        this.setState({stc: this.readStc()});
        if (this.state.Designer || this.loading) return;
        this.loading = true;
        try {
            const engine = await import(/* webpackChunkName: "bw-board" */ '../../lib/bw-board/index.js');
            const ui = await import(/* webpackChunkName: "bw-circuit-ui" */ '../../lib/bw-circuit-ui/index.js');
            ui.setEngine(engine);   // the panel takes the engine by injection, not by path
            this.setState({Designer: ui.CircuitDesigner});
        } catch (e) {
            this.setState({error: e.message});
        }
        this.loading = false;
    }

    /** The project's own hardware declarations — device, clock, and the pin table. */
    readStc () {
        try {
            return JSON.parse(this.props.vm.toJSON()).stc || null;
        } catch {
            return null;
        }
    }

    render () {
        const {Designer, error, stc} = this.state;
        const box = {height: '100%', overflow: 'auto', padding: 12, boxSizing: 'border-box'};
        if (error) {
            return (
                <div style={{...box, color: '#b91c1c'}}>
                    {`The circuit designer failed to load: ${error}`}
                </div>
            );
        }
        if (!Designer) {
            return <div style={{...box, color: '#64748b'}}>{'Loading the circuit designer…'}</div>;
        }
        return (
            <div style={box}>
                {stc && stc.pins && stc.pins.length ? null : (
                    <div style={{marginBottom: 10, padding: '8px 10px', borderRadius: 6,
                        background: '#fefce8', border: '1px solid #fde68a', fontSize: 13, color: '#713f12'}}>
                        {'This project declares no pins, so the board starts empty. ' +
                         'Declare them in the Code tab — e.g. PIN led1 IS P1.0 OUTPUT ACTIVE LOW — ' +
                         'and the designer will suggest the matching parts.'}
                    </div>
                )}
                <Designer stc={stc} />
            </div>
        );
    }
}

CircuitTab.propTypes = {
    isVisible: PropTypes.bool,
    vm: PropTypes.shape({toJSON: PropTypes.func}).isRequired
};

export default connect(state => ({
    vm: state.scratchGui.vm,
    isVisible: state.scratchGui.editorTab.activeTabIndex === 4
}))(CircuitTab);
