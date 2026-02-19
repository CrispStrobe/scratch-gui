/**
 * Copyright (C) 2021 Thomas Weber
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import React from 'react';
import downloadBlob from '../lib/download-blob.js';
import Settings from '../addons/settings/settings.jsx';
import render from './app-target';

const onExportSettings = settings => {
    const blob = new Blob([JSON.stringify(settings)]);
    downloadBlob('turbowarp-addon-settings.json', blob);
};

// When this page is opened via window.open() from the editor, window.opener is set
// and window.close() returns to the opener tab. When navigated to directly (or inside
// a Capacitor WebView where window.open navigates in-place), history.back() is used.
const onClose = () => {
    if (window.opener) {
        window.close();
    } else {
        history.back();
    }
};

render((
    <Settings
        onClose={onClose}
        onExportSettings={onExportSettings}
    />
));
