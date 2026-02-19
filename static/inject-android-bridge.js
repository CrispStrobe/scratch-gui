(function() {
    console.log("TurboWarp Android Bridge Initializing...");

    // This object mimics the Scratch Link WebSocket behavior
    window.AndroidBluetoothBridge = {
        send: function(data) {
            const request = JSON.parse(data);
            console.log("Bridge received:", request.method);

            if (request.method === 'discover') {
                // Trigger Android Native Bluetooth Scan
                bluetoothSerial.list(devices => {
                    // Map Android devices back to Scratch format
                    const scratchDevices = devices.map(d => ({
                        name: d.name,
                        peripheralId: d.id,
                        rssi: -50
                    }));
                    // Send back to Scratch
                    window.dispatchEvent(new CustomEvent('scratch-link-response', { 
                        detail: { method: 'didDiscoverPeripheral', params: scratchDevices[0] } 
                    }));
                }, err => console.error("Scan failed", err));
            }
            
            if (request.method === 'connect') {
                const id = request.params.peripheralId;
                bluetoothSerial.connect(id, () => {
                    console.log("Connected to brick!");
                    window.dispatchEvent(new CustomEvent('scratch-link-response', { 
                        detail: { method: 'didConnect' } 
                    }));
                }, err => console.error("Connect failed", err));
            }
        }
    };

    // Intercept WebSocket constructor if necessary or 
    // hook into the scratch-vm device manager here.
})();
