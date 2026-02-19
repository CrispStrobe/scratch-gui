import {isCapacitor} from './tw-platform';

let fileSavePlugin = null;

const getFileSavePlugin = () => {
    if (!fileSavePlugin && isCapacitor()) {
        // Access the registered native plugin via Capacitor.Plugins
        fileSavePlugin = window.Capacitor.Plugins.FileSave;
    }
    return fileSavePlugin;
};

/**
 * Convert a Blob to a base64 string.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
const blobToBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        // result is "data:<mime>;base64,<data>" - extract just the base64 part
        const base64 = reader.result.split(',')[1];
        resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
});

/**
 * Save a file using Android's native file picker (ACTION_CREATE_DOCUMENT).
 * @param {Blob} blob - The file data
 * @param {string} fileName - Suggested file name
 * @param {string} [mimeType] - MIME type
 * @returns {Promise<{uri: string}>}
 */
const saveFile = async (blob, fileName, mimeType) => {
    const plugin = getFileSavePlugin();
    if (!plugin) {
        throw new Error('FileSave plugin not available');
    }
    const base64Data = await blobToBase64(blob);
    return plugin.saveFile({
        fileName,
        mimeType: mimeType || blob.type || 'application/octet-stream',
        data: base64Data
    });
};

/**
 * Open a file using Android's native file picker (ACTION_OPEN_DOCUMENT).
 * @param {object} [options]
 * @param {string} [options.mimeType] - MIME type filter
 * @returns {Promise<{data: string, name: string, uri: string}>}
 */
const openFile = async (options = {}) => {
    const plugin = getFileSavePlugin();
    if (!plugin) {
        throw new Error('FileSave plugin not available');
    }
    return plugin.openFile({
        mimeType: options.mimeType || '*/*'
    });
};

/**
 * Convert a base64 string to an ArrayBuffer.
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
const base64ToArrayBuffer = base64 => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

export {
    saveFile,
    openFile,
    base64ToArrayBuffer,
    getFileSavePlugin
};
