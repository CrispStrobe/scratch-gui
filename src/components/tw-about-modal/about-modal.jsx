import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import LICENSE_MANIFEST from '../../lib/license-manifest.generated.js';
import styles from './about-modal.css';

/* eslint-disable react/no-multi-comp */

const messages = defineMessages({
    title: {
        defaultMessage: 'About Brickwright',
        description: 'Title of the about modal',
        id: 'tw.aboutModal.title'
    }
});

const ExternalLink = props => (
    <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
    >
        {props.children}
    </a>
);
ExternalLink.propTypes = {
    href: PropTypes.string.isRequired,
    children: PropTypes.node
};

const Section = props => (
    <div className={styles.section}>
        <div className={styles.sectionTitle}>{props.title}</div>
        <div className={styles.sectionBody}>{props.children}</div>
    </div>
);
Section.propTypes = {
    title: PropTypes.node,
    children: PropTypes.node
};

const AboutModalComponent = props => (
    <Modal
        className={styles.modalContent}
        onRequestClose={props.onClose}
        contentLabel={props.intl.formatMessage(messages.title)}
        id="aboutModal"
    >
        <Box className={styles.body}>
            <div className={styles.appName}>{'Brickwright'}</div>
            <div className={styles.tagline}>
                <FormattedMessage
                    defaultMessage="Code, blocks, or bricks — one project, any way you build it."
                    description="Tagline shown at the top of the about modal"
                    id="tw.aboutModal.tagline"
                />
            </div>

            <Section
                title={(
                    <FormattedMessage
                        defaultMessage="Who we are"
                        description="About modal section heading"
                        id="tw.aboutModal.whoWeAre"
                    />
                )}
            >
                <p>
                    <FormattedMessage
                        defaultMessage="Brickwright is made by CrispStrobe. It's free, open source, and always will be."
                        description="About modal — who we are"
                        id="tw.aboutModal.whoWeAreText"
                    />
                </p>
                <p>
                    <ExternalLink href="https://github.com/CrispStrobe/brickwright">
                        {'github.com/CrispStrobe/brickwright'}
                    </ExternalLink>
                    {' — '}
                    <FormattedMessage
                        defaultMessage="issues and pull requests are welcome."
                        description="About modal — invitation to contribute"
                        id="tw.aboutModal.contribute"
                    />
                </p>
            </Section>

            <Section
                title={(
                    <FormattedMessage
                        defaultMessage="Built on"
                        description="About modal section heading"
                        id="tw.aboutModal.builtOn"
                    />
                )}
            >
                <p>
                    <FormattedMessage
                        defaultMessage="Brickwright is a fork of {turbowarp}, itself built on {scratch}."
                        description="About modal — credit to upstream projects"
                        id="tw.aboutModal.builtOnText"
                        values={{
                            turbowarp: <ExternalLink href="https://turbowarp.org/">{'TurboWarp'}</ExternalLink>,
                            scratch: <ExternalLink href="https://scratch.mit.edu/">{'Scratch'}</ExternalLink>
                        }}
                    />
                </p>
            </Section>

            <Section
                title={(
                    <FormattedMessage
                        defaultMessage="Our extensions"
                        description="About modal section heading"
                        id="tw.aboutModal.extensions"
                    />
                )}
            >
                <p>
                    <FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="The extension gallery and the {compiler} that power the Pseudocode / Python / JavaScript code tabs are also ours."
                        description="About modal — our own extensions and compiler"
                        id="tw.aboutModal.extensionsText"
                        values={{
                            compiler: (
                                <ExternalLink href="https://github.com/CrispStrobe/sb3-creator">
                                    {'sb3-creator compiler'}
                                </ExternalLink>
                            )
                        }}
                    />
                </p>
                <p>
                    <ExternalLink href="https://github.com/CrispStrobe/extensions">
                        {'github.com/CrispStrobe/extensions'}
                    </ExternalLink>
                </p>
            </Section>

            <Section
                title={(
                    <FormattedMessage
                        defaultMessage="Dependencies & licenses"
                        description="About modal section heading"
                        id="tw.aboutModal.dependencies"
                    />
                )}
            >
                <p>
                    <FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Brickwright is built with these open-source packages. This list is generated from package.json, so it stays accurate as dependencies change."
                        description="About modal — dependency list intro"
                        id="tw.aboutModal.dependenciesText"
                    />
                </p>
                <table className={styles.depTable}>
                    <tbody>
                        {LICENSE_MANIFEST.map(dep => (
                            <tr key={dep.name}>
                                <td className={styles.depName}>
                                    {dep.homepage ? (
                                        <ExternalLink href={dep.homepage}>{dep.name}</ExternalLink>
                                    ) : dep.name}
                                </td>
                                <td className={styles.depVersion}>{dep.version}</td>
                                <td className={styles.depLicense}>{dep.license}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>
        </Box>
    </Modal>
);

AboutModalComponent.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func
};

export default injectIntl(AboutModalComponent);
