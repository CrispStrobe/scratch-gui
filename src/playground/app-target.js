import ReactDOM from 'react-dom';
import {setAppElement} from 'react-modal';
import {applyStoredChrome} from '../components/gui/chrome-toggle.jsx';

const appTarget = document.getElementById('app');

// Remove everything from the target to fix macOS Safari "Save Page As",
while (appTarget.firstChild) {
    appTarget.removeChild(appTarget.firstChild);
}

setAppElement(appTarget);

const render = children => {
    // Before first paint, or the tall chrome flashes and then collapses.
    applyStoredChrome();
    ReactDOM.render(children, appTarget);

    if (window.SplashEnd) {
        window.SplashEnd();
    }
};

export default render;
