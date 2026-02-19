import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import Modal from './modal.jsx';
import {closeAddonSettingsModal} from '../reducers/modals';
import downloadBlob from '../lib/download-blob';

const LazyAddonSettings = React.lazy(() => import(
    /* webpackChunkName: "addon-settings-modal" */
    '../addons/settings/settings.jsx'
));

const handleExportSettings = data => {
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    downloadBlob('addon-settings.json', blob);
};

const AddonSettingsModal = ({onRequestClose}) => (
    <Modal
        fullScreen
        id="addonSettings"
        contentLabel="Addon Settings"
        onRequestClose={onRequestClose}
    >
        <div style={{overflow: 'auto', flex: 1}}>
            <React.Suspense fallback={<div style={{padding: '20px', textAlign: 'center'}}>Loading...</div>}>
                <LazyAddonSettings
                    onClose={onRequestClose}
                    onExportSettings={handleExportSettings}
                />
            </React.Suspense>
        </div>
    </Modal>
);

AddonSettingsModal.propTypes = {
    onRequestClose: PropTypes.func.isRequired
};

const mapDispatchToProps = dispatch => ({
    onRequestClose: () => dispatch(closeAddonSettingsModal())
});

export default connect(
    null,
    mapDispatchToProps
)(AddonSettingsModal);
