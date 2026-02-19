import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import ModalComponent from '../components/modal/modal.jsx';
import {isCapacitor} from '../lib/tw-platform';

class Modal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'addEventListeners',
            'removeEventListeners',
            'handlePopState',
            'handleCapacitorBackButton',
            'pushHistory'
        ]);
        this.backButtonListener = null;
        this.addEventListeners();
    }
    componentDidMount () {
        // Add a history event only if it's not currently for our modal. This
        // avoids polluting the history with many entries. We only need one.
        this.pushHistory(this.id, (history.state === null || history.state !== this.id));
    }
    componentWillUnmount () {
        this.removeEventListeners();
    }
    addEventListeners () {
        window.addEventListener('popstate', this.handlePopState);
        if (isCapacitor() && window.Capacitor.Plugins.App) {
            // Capacitor 4+: addListener() returns the PluginListenerHandle directly, not a Promise.
            this.backButtonListener = window.Capacitor.Plugins.App.addListener(
                'backButton',
                this.handleCapacitorBackButton
            );
        }
    }
    removeEventListeners () {
        window.removeEventListener('popstate', this.handlePopState);
        if (this.backButtonListener) {
            this.backButtonListener.remove();
            this.backButtonListener = null;
        }
    }
    handlePopState () {
        // Whenever someone navigates, we want to be closed
        this.props.onRequestClose();
    }
    handleCapacitorBackButton () {
        // Navigate back in browser history, which will trigger handlePopState
        // to close the modal. This also properly pops the history entry pushed
        // in componentDidMount, preventing orphaned history entries.
        history.back();
    }
    get id () {
        return `modal-${this.props.id}`;
    }
    pushHistory (state, push) {
        if (push) return history.pushState(state, this.id, null);
        history.replaceState(state, this.id, null);
    }
    render () {
        return <ModalComponent {...this.props} />;
    }
}

Modal.propTypes = {
    id: PropTypes.string.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func,
    onRequestOpen: PropTypes.func
};

const mapStateToProps = state => ({
    isRtl: state.locales.isRtl
});

export default connect(
    mapStateToProps
)(Modal);
