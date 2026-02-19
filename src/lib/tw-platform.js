const isAndroid = () => /Android/i.test(navigator.userAgent);

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

const isCapacitor = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// Returns the Capacitor platform string ('android', 'ios', 'web') when running
// inside Capacitor, or null when running as a plain web page.
const capacitorPlatform = () => (isCapacitor() ? window.Capacitor.getPlatform() : null);

const isCapacitorAndroid = () => capacitorPlatform() === 'android';

const isCapacitorIOS = () => capacitorPlatform() === 'ios';

const isMobile = () => isAndroid() || isIOS();

export {
    isAndroid,
    isIOS,
    isCapacitor,
    isCapacitorAndroid,
    isCapacitorIOS,
    capacitorPlatform,
    isMobile
};
