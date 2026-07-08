import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {closeAboutModal} from '../reducers/modals';
import AboutModalComponent from '../components/tw-about-modal/about-modal.jsx';

const AboutModal = props => (
    <AboutModalComponent
        onClose={props.onClose}
    />
);

AboutModal.propTypes = {
    onClose: PropTypes.func
};

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeAboutModal())
});

export default connect(
    null,
    mapDispatchToProps
)(AboutModal);
