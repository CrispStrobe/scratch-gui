/**
 * Multimeter model — voltage, current, and resistance measurement.
 *
 * The honesty rule: resistance() returns 'requires-power-off' when the
 * board is powered. This is a FEATURE — a real DMM measures resistance
 * with the power off. The UI should prompt the user to switch off,
 * not show an error.
 *
 * Every reading comes from the engine. Nothing is fabricated.
 */

/**
 * @typedef {'voltage' | 'current' | 'resistance'} MeterMode
 */

/**
 * @typedef {object} Probe
 * @property {string|null} netId — the net being probed (for V and Ω)
 * @property {string|null} partId — the part being probed (for A)
 * @property {string|null} terminal — the terminal being probed (for A)
 */

/**
 * @typedef {object} MeterState
 * @property {MeterMode} mode
 * @property {Probe} probeA
 * @property {Probe} probeB
 */

/**
 * Create a fresh meter state.
 * @returns {MeterState}
 */
export function createMeterState() {
  return {
    mode: 'voltage',
    probeA: { netId: null, partId: null, terminal: null },
    probeB: { netId: null, partId: null, terminal: null },
  };
}

/**
 * Take a meter reading. Returns a display object.
 *
 * @param {MeterState} meter
 * @param {import('./circuit.js').Circuit} circuit
 * @returns {{ value: string, unit: string, note: string|null }}
 */
export function readMeter(meter, circuit) {
  const { mode, probeA, probeB } = meter;

  switch (mode) {
    case 'voltage': {
      if (!probeA.netId || !probeB.netId) {
        return { value: '---', unit: 'V', note: 'Place both probes on nets' };
      }
      try {
        const vA = circuit.nodeVoltage(probeA.netId);
        const vB = circuit.nodeVoltage(probeB.netId);
        const diff = vA - vB;
        return { value: diff.toFixed(3), unit: 'V', note: null };
      } catch {
        return { value: '---', unit: 'V', note: 'Cannot read voltage' };
      }
    }

    case 'current': {
      if (!probeA.partId || !probeA.terminal) {
        return { value: '---', unit: 'A', note: 'Place probe A on a part terminal' };
      }
      try {
        const i = circuit.branchCurrent(probeA.partId, probeA.terminal);
        // Display in mA for readability
        const mA = i * 1000;
        return {
          value: Math.abs(mA) < 0.001 ? '0.000' : mA.toFixed(3),
          unit: 'mA',
          note: null,
        };
      } catch {
        return { value: '---', unit: 'mA', note: 'Cannot read current' };
      }
    }

    case 'resistance': {
      if (!probeA.netId || !probeB.netId) {
        return { value: '---', unit: 'Ω', note: 'Place both probes on nets' };
      }
      try {
        const r = circuit.resistance(probeA.netId, probeB.netId);
        if (r === 'requires-power-off') {
          // This is the meter behaving correctly, not an error.
          return {
            value: '---',
            unit: 'Ω',
            note: 'Turn power OFF to measure resistance (this is how a real DMM works)',
          };
        }
        if (r > 1e6) {
          return { value: (r / 1e6).toFixed(2), unit: 'MΩ', note: null };
        }
        if (r > 1e3) {
          return { value: (r / 1e3).toFixed(2), unit: 'kΩ', note: null };
        }
        return { value: r.toFixed(1), unit: 'Ω', note: null };
      } catch {
        return { value: '---', unit: 'Ω', note: 'Cannot read resistance' };
      }
    }

    default:
      return { value: '---', unit: '', note: 'Unknown mode' };
  }
}
