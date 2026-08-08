/**
 * Board implementation — closed-form solver for the starter-kit component set.
 *
 * No MNA solver yet. Handles: resistor, LED, potentiometer, button, buzzer,
 * capacitor, VCC, GND, and MCU pins via Thévenin equivalents.
 *
 * @module
 */

/** @typedef {import('./types.js').Part} Part */
/** @typedef {import('./types.js').Net} Net */
/** @typedef {import('./types.js').PinId} PinId */
/** @typedef {import('./types.js').PinMode} PinMode */
/** @typedef {import('./types.js').TheveninSource} TheveninSource */

import { pinThevenin } from './pin-model.js';
import { solveMNA } from './mna.js';
import { validateNetlist } from './validate.js';

/**
 * Internal pin state.
 * @typedef {object} PinState
 * @property {PinMode} mode
 * @property {boolean} driveHigh
 */

/**
 * LED default parameters.
 */
const LED_VF = 2.0;       // forward voltage threshold
const LED_RD = 10;         // dynamic resistance above threshold
const LED_I_RATED = 0.020; // 20 mA rated current (for brightness normalization)

/**
 * Brightness integrator window.
 */
const BRIGHTNESS_WINDOW_NS = 20_000_000n; // 20 ms

/**
 * Combine multiple Thévenin sources into one via Norton equivalents.
 * @param {Array<{vTh: number, rTh: number}>} sources
 * @returns {{ vTh: number, rTh: number } | null}
 */
function combineThevenin(sources) {
  if (sources.length === 0) return null;
  if (sources.length === 1) return sources[0];

  let iTotal = 0;
  let gTotal = 0;
  for (const s of sources) {
    const r = Math.max(s.rTh, 0.001);
    gTotal += 1 / r;
    iTotal += s.vTh / r;
  }
  if (gTotal <= 0) return null;
  return { vTh: iTotal / gTotal, rTh: 1 / gTotal };
}

export class BoardImpl {
  constructor(vcc = 5.0) {
    /** @type {number} */
    this.vcc = vcc;

    /** @type {boolean} */
    this.powered = true;

    /** @type {Part[]} */
    this.parts = [];

    /** @type {Net[]} */
    this.nets = [];

    /** @type {Map<string, Part>} part id → Part */
    this.partMap = new Map();

    /** @type {Map<string, Net>} net id → Net */
    this.netMap = new Map();

    /** @type {Map<string, PinState>} PinId → state */
    this.pinStates = new Map();

    /** @type {Map<string, number>} part id → control value (pot 0…1, button 0/1) */
    this.controls = new Map();

    /** @type {bigint} current simulation time in nanoseconds */
    this.timeNs = 0n;

    /**
     * LED brightness history: part id → array of {tNs, current} samples.
     * @type {Map<string, Array<{tNs: bigint, current: number}>>}
     */
    this.ledHistory = new Map();

    /**
     * Buzzer edge history: part id → array of timestamps when the driving net toggled.
     * @type {Map<string, bigint[]>}
     */
    this.buzzerEdges = new Map();

    /**
     * Cached node voltages from last solve.
     * @type {Map<string, number>}
     */
    this.nodeVoltages = new Map();

    /**
     * Inductor currents: part id → current through the inductor.
     * @type {Map<string, number>}
     */
    this.inductorCurrents = new Map();

    /**
     * Cached LED currents from last solve.
     * @type {Map<string, number>}
     */
    this.ledCurrents = new Map();

    /**
     * Capacitor voltages: part id → current voltage across the cap.
     * @type {Map<string, number>}
     */
    this.capVoltages = new Map();
  }

  // ─── Boundary B: setNetlist ──────────────────────────────────────────────

  /**
   * @param {Part[]} parts
   * @param {Net[]} nets
   */
  setNetlist(parts, nets) {
    // Validate the netlist and reject malformed input. Without this,
    // a wrong terminal name (e.g. {a,b} instead of {anode,cathode} for
    // an LED) silently produces brightness 0 — a plausible wrong answer.
    const errors = validateNetlist(parts, nets);
    const fatal = errors.filter(e => e.severity === 'error');
    if (fatal.length > 0) {
      throw new Error(
        'Invalid netlist:\n' + fatal.map(e => `  - ${e.message}`).join('\n')
      );
    }

    this.parts = parts;
    this.nets = nets;
    this.partMap = new Map(parts.map(p => [p.id, p]));
    this.netMap = new Map(nets.map(n => [n.id, n]));
    this.ledHistory.clear();
    this.buzzerEdges.clear();
    this.capVoltages.clear();
    this.nodeVoltages.clear();
    this.ledCurrents.clear();

    for (const p of parts) {
      if (p.kind === 'led') {
        this.ledHistory.set(p.id, []);
      }
      if (p.kind === 'buzzer') {
        this.buzzerEdges.set(p.id, []);
      }
      if (p.kind === 'capacitor') {
        if (!this.capVoltages.has(p.id)) {
          this.capVoltages.set(p.id, 0); // start uncharged
        }
      }
      if (p.kind === 'inductor') {
        if (!this.inductorCurrents.has(p.id)) {
          this.inductorCurrents.set(p.id, 0); // start with zero current
        }
      }
    }

    this._solve();
    this._recordLedSamples();
    this._notifyChange('netlist');
  }

  // ─── Boundary A: McuToBoard ──────────────────────────────────────────────

  /**
   * @param {PinId} pin
   * @param {PinMode} mode
   * @param {boolean} driveHigh
   */
  setPin(pin, mode, driveHigh) {
    const prev = this.pinStates.get(pin);
    this.pinStates.set(pin, { mode, driveHigh });
    this._solve();
    this._recordLedSamples();

    // Record buzzer edges on state change
    if (prev && prev.driveHigh !== driveHigh) {
      this._recordBuzzerEdges(pin);
    }

    this._notifyChange('pin', { pin, mode, driveHigh });
  }

  /**
   * @param {bigint} tNs
   */
  advanceTo(tNs) {
    const prevNs = this.timeNs;
    this.timeNs = tNs;

    // Integrate capacitor RC steps
    if (tNs > prevNs && this.powered) {
      const dtSec = Number(tNs - prevNs) / 1e9;
      this._integrateCapacitors(dtSec);
    }

    // Record LED current samples at this timestamp
    this._recordLedSamples();
    this._notifyChange('time', { tNs });
  }

  // ─── Boundary A: BoardToMcu ──────────────────────────────────────────────

  /**
   * @param {PinId} pin
   * @returns {0 | 1}
   */
  readPin(pin) {
    const v = this._pinVoltage(pin);
    // Standard TTL threshold for 5V: ~1.5V (VIL max ~0.8V, VIH min ~2.0V).
    // Use midpoint ~1.5V for simplicity.
    return v > 1.5 ? 1 : 0;
  }

  /**
   * @param {PinId} pin
   * @returns {number} voltage 0…VCC
   */
  readAnalog(pin) {
    const v = this._pinVoltage(pin);
    return Number.isFinite(v) ? v : 0;
  }

  // ─── Boundary B: instruments ─────────────────────────────────────────────

  /**
   * @param {string} netId
   * @returns {number}
   */
  nodeVoltage(netId) {
    const v = this.nodeVoltages.get(netId) ?? 0;
    return Number.isFinite(v) ? v : 0;
  }

  /**
   * @param {string} partId
   * @param {string} terminal
   * @returns {number}
   */
  branchCurrent(partId, terminal) {
    const result = this._solveMNA(false);
    const partCurrents = result.branchCurrents.get(partId);
    if (!partCurrents) return 0;
    const i = partCurrents.get(terminal) ?? 0;
    return Number.isFinite(i) ? i : 0;
  }

  /**
   * @param {string} a
   * @param {string} b
   * @returns {number | 'requires-power-off'}
   */
  resistance(a, b) {
    if (this.powered) return 'requires-power-off';

    const testCurrent = 0.001; // 1 mA test current
    // testNodeB is used as the reference (V=0), so R = V_A / I_test
    const result = this._solveMNA(true, a, b, testCurrent);
    const vA = result.nodeVoltages.get(a) ?? 0;
    const r = Math.abs(vA) / testCurrent;
    return Number.isFinite(r) ? r : 0;
  }

  // ─── Boundary B: transducers ─────────────────────────────────────────────

  /**
   * @param {string} partId
   * @returns {number} 0…1
   */
  ledBrightness(partId) {
    const history = this.ledHistory.get(partId);
    if (!history || history.length === 0) return 0;

    const now = this.timeNs;
    const windowStart = now > BRIGHTNESS_WINDOW_NS ? now - BRIGHTNESS_WINDOW_NS : 0n;

    // Find the most recent sample at or before windowStart (the "initial" value
    // for the window), plus all samples within the window.
    let initialCurrent = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].tNs <= windowStart) {
        initialCurrent = history[i].current;
        break;
      }
    }

    // Build the step function over [windowStart, now].
    // Each segment holds a constant current until the next change.
    /** @type {Array<{tNs: bigint, current: number}>} */
    const steps = [];

    // Start of window: either the initial sample's value or 0
    steps.push({ tNs: windowStart, current: initialCurrent });

    // Add all samples within the window
    for (const s of history) {
      if (s.tNs > windowStart && s.tNs <= now) {
        steps.push(s);
      }
    }

    // Integrate the step function
    const windowNs = now - windowStart;
    if (windowNs <= 0n) {
      // Time hasn't advanced — return instantaneous value
      const last = history[history.length - 1];
      return Math.min(1, Math.max(0, last.current / LED_I_RATED));
    }

    let weightedSum = 0;
    for (let i = 0; i < steps.length; i++) {
      const nextT = i + 1 < steps.length ? steps[i + 1].tNs : now;
      const dt = nextT - steps[i].tNs;
      weightedSum += steps[i].current * Number(dt);
    }

    const avgCurrent = weightedSum / Number(windowNs);
    return Math.min(1, Math.max(0, avgCurrent / LED_I_RATED));
  }

  /**
   * @param {string} partId
   * @returns {{hz: number, on: boolean}}
   */
  buzzerTone(partId) {
    const edges = this.buzzerEdges.get(partId);
    if (!edges || edges.length < 2) return { hz: 0, on: false };

    // Measure period from the last two edges
    const last = edges[edges.length - 1];
    const prev = edges[edges.length - 2];
    const halfPeriodNs = Number(last - prev);
    if (halfPeriodNs <= 0) return { hz: 0, on: false };

    // Staleness check: if the last edge is more than 100ms ago,
    // the buzzer has stopped toggling (e.g., after a debug halt).
    // Report as off rather than a meaninglessly low frequency.
    const age = this.timeNs - last;
    if (age > 100_000_000n) return { hz: 0, on: false };

    const hz = 1e9 / (2 * halfPeriodNs); // two edges = one full period
    return { hz, on: true };
  }

  /**
   * Seven-segment display brightness: returns brightness for each segment.
   * The display part has terminals: a, b, c, d, e, f, g, dp, common.
   * Each segment is an LED between its terminal and the common terminal.
   *
   * @param {string} partId
   * @returns {{ a: number, b: number, c: number, d: number, e: number, f: number, g: number, dp: number }}
   */
  sevenSegmentBrightness(partId) {
    const result = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, dp: 0 };
    const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
    for (const seg of segments) {
      const ledId = `${partId}_${seg}`;
      result[seg] = this.ledBrightness(ledId);
    }
    return result;
  }

  /**
   * RGB LED brightness: returns brightness for each channel.
   * The part has terminals: r, g, b, common.
   *
   * @param {string} partId
   * @returns {{ r: number, g: number, b: number }}
   */
  rgbLedBrightness(partId) {
    return {
      r: this.ledBrightness(`${partId}_r`),
      g: this.ledBrightness(`${partId}_g`),
      b: this.ledBrightness(`${partId}_b`),
    };
  }

  // ─── Boundary B: user interaction ────────────────────────────────────────

  /**
   * @param {string} partId
   * @param {number} value
   */
  setControl(partId, value) {
    this.controls.set(partId, value);
    this._solve();
    this._notifyChange('control', { partId, value });
  }

  /**
   * @param {boolean} on
   */
  setPower(on) {
    this.powered = on;
    this._solve();
    this._recordLedSamples();
    this._notifyChange('power', { on });
  }

  // ─── State getters ───────────────────────────────────────────────────────

  /** Current simulation time in nanoseconds. @returns {bigint} */
  getTime() { return this.timeNs; }

  /** Whether the board is powered. @returns {boolean} */
  isPowered() { return this.powered; }

  /** Supply voltage. @returns {number} */
  getVcc() { return this.vcc; }

  /**
   * Current state of an MCU pin.
   * @param {PinId} pin
   * @returns {{ mode: PinMode, driveHigh: boolean } | null}
   */
  getPinState(pin) {
    const s = this.pinStates.get(pin);
    return s ? { mode: s.mode, driveHigh: s.driveHigh } : null;
  }

  /**
   * Current value of a user control (pot position, button state).
   * @param {string} partId
   * @returns {number | undefined}
   */
  getControl(partId) {
    return this.controls.get(partId);
  }

  /**
   * Current voltage across a capacitor.
   * @param {string} partId
   * @returns {number}
   */
  getCapVoltage(partId) {
    return this.capVoltages.get(partId) ?? 0;
  }

  /**
   * Current through an inductor (DC steady-state).
   * @param {string} partId
   * @returns {number}
   */
  getInductorCurrent(partId) {
    return this.inductorCurrents.get(partId) ?? 0;
  }

  // ─── Part queries ───────────────────────────────────────────────────────

  /** All parts in the current netlist. @returns {Part[]} */
  getParts() { return this.parts; }

  /** All nets in the current netlist. @returns {Net[]} */
  getNets() { return this.nets; }

  /**
   * Get the expected terminal names for a part kind.
   * Returns null for MCU (terminals are PinIds) and composites.
   * Useful for the UI inspector panel.
   *
   * @param {string} kind
   * @returns {string[] | null}
   */
  static getTerminalsForKind(kind) {
    const map = {
      vcc: ['vcc'], gnd: ['gnd'],
      resistor: ['a', 'b'], capacitor: ['a', 'b'], inductor: ['a', 'b'],
      diode: ['anode', 'cathode'], led: ['anode', 'cathode'],
      zener: ['anode', 'cathode'],
      potentiometer: ['a', 'b', 'wiper'],
      button: ['a', 'b'], switch: ['a', 'b'],
      buzzer: ['a', 'b'], ldr: ['a', 'b'], ntc: ['a', 'b'],
      npn: ['base', 'collector', 'emitter'],
      pnp: ['base', 'collector', 'emitter'],
    };
    return map[kind] ?? null;
  }

  /**
   * Get all known part kinds.
   * @returns {string[]}
   */
  static getPartKinds() {
    return [
      'vcc', 'gnd', 'resistor', 'capacitor', 'inductor',
      'diode', 'led', 'zener', 'potentiometer',
      'button', 'switch', 'buzzer', 'ldr', 'ntc',
      'npn', 'pnp', 'seven_segment', 'rgb_led', 'mcu',
    ];
  }

  /** All LED part IDs. @returns {string[]} */
  getLeds() { return this.parts.filter(p => p.kind === 'led').map(p => p.id); }

  /** All buzzer part IDs. @returns {string[]} */
  getBuzzers() { return this.parts.filter(p => p.kind === 'buzzer').map(p => p.id); }

  /**
   * All controllable parts: pots, buttons, switches, LDRs, NTCs.
   * @returns {Array<{id: string, kind: string, value: number}>}
   */
  getControls() {
    const controllable = ['potentiometer', 'button', 'switch', 'ldr', 'ntc'];
    return this.parts
      .filter(p => controllable.includes(p.kind))
      .map(p => ({ id: p.id, kind: p.kind, value: this.controls.get(p.id) ?? 0 }));
  }

  /**
   * All MCU pin IDs currently tracked.
   * @returns {Array<{pin: string, mode: string, driveHigh: boolean}>}
   */
  getPinStates() {
    return [...this.pinStates.entries()].map(([pin, s]) => ({
      pin, mode: s.mode, driveHigh: s.driveHigh,
    }));
  }

  // ─── Change notification ────────────────────────────────────────────────

  /**
   * Register a callback for board state changes.
   * Called after every setPin, setControl, setPower, advanceTo, and setNetlist.
   *
   * @param {(event: {type: string, detail?: any}) => void} fn
   */
  onChange(fn) {
    if (!this._changeListeners) this._changeListeners = [];
    this._changeListeners.push(fn);
  }

  /**
   * Remove a previously registered change listener.
   * @param {(event: {type: string, detail?: any}) => void} fn
   */
  offChange(fn) {
    if (!this._changeListeners) return;
    this._changeListeners = this._changeListeners.filter(f => f !== fn);
  }

  /** @param {string} type @param {any} [detail] */
  _notifyChange(type, detail) {
    if (!this._changeListeners) return;
    const event = { type, detail };
    for (const fn of this._changeListeners) {
      try { fn(event); } catch { /* listener error must not break the board */ }
    }
  }

  // ─── Circuit warnings ──────────────────────────────────────────────────

  /**
   * Check the circuit for potential problems: overcurrent, missing
   * ground path, LED without resistor, etc.
   *
   * @returns {Array<{severity: 'warning' | 'danger', partId?: string, message: string}>}
   */
  getWarnings() {
    /** @type {Array<{severity: 'warning' | 'danger', partId?: string, message: string}>} */
    const warnings = [];

    if (!this.powered) return warnings;

    for (const part of this.parts) {
      if (part.kind === 'led') {
        // Use closed-form current if available, fall back to MNA
        let current = this.ledCurrents.get(part.id) ?? 0;
        if (current === 0) {
          try { current = this.branchCurrent(part.id, 'anode'); } catch {}
        }
        if (current > 0.025) { // > 25 mA
          warnings.push({
            severity: 'danger',
            partId: part.id,
            message: `${part.id}: current ${(current * 1000).toFixed(1)} mA exceeds 20 mA rating. Add or increase the series resistor.`,
          });
        }
      }

      // Check for MCU pins driving into VCC or GND directly (short circuit)
      if (part.kind === 'mcu') {
        for (const terminal of part.terminals) {
          const state = this.pinStates.get(terminal);
          if (!state || state.mode === 'input') continue;

          // Find the net this pin is on
          const net = this.nets.find(n => n.terminals.some(
            t => t.part === part.id && t.terminal === terminal
          ));
          if (!net) continue;

          // Check if this net is directly connected to VCC or GND
          for (const t of net.terminals) {
            if (t.part === part.id) continue;
            const other = this.partMap.get(t.part);
            if (!other) continue;
            if (other.kind === 'vcc' && state.mode !== 'input' && !state.driveHigh) {
              warnings.push({
                severity: 'danger',
                partId: part.id,
                message: `${terminal}: pin drives LOW but is wired directly to VCC. This is a short circuit.`,
              });
            }
            if (other.kind === 'gnd' && state.mode !== 'input' && state.driveHigh && state.mode === 'pushpull') {
              warnings.push({
                severity: 'danger',
                partId: part.id,
                message: `${terminal}: pin drives HIGH but is wired directly to GND. This is a short circuit.`,
              });
            }
          }
        }
      }
    }

    // Check for LED wired backward (cathode to VCC, anode to GND)
    for (const part of this.parts) {
      if (part.kind !== 'led') continue;
      const anodeNet = this._netForTerminal(part.id, 'anode');
      const cathodeNet = this._netForTerminal(part.id, 'cathode');
      if (!anodeNet || !cathodeNet) continue;

      const anodeV = this.nodeVoltages.get(anodeNet) ?? 0;
      const cathodeV = this.nodeVoltages.get(cathodeNet) ?? 0;
      if (cathodeV > anodeV + 0.5) {
        warnings.push({
          severity: 'warning',
          partId: part.id,
          message: `${part.id}: LED appears to be wired backward (cathode at ${cathodeV.toFixed(1)}V > anode at ${anodeV.toFixed(1)}V). Swap anode and cathode.`,
        });
      }
    }

    // Check for output pins with nothing connected
    for (const part of this.parts) {
      if (part.kind !== 'mcu') continue;
      for (const terminal of part.terminals) {
        const state = this.pinStates.get(terminal);
        if (!state || state.mode === 'input') continue;

        const net = this.nets.find(n => n.terminals.some(
          t => t.part === part.id && t.terminal === terminal
        ));
        if (!net) continue;

        // Check if this pin's net has only the MCU terminal (nothing else connected)
        const externalTerminals = net.terminals.filter(t => t.part !== part.id);
        if (externalTerminals.length === 0) {
          warnings.push({
            severity: 'warning',
            partId: part.id,
            message: `${terminal}: output pin is driving but nothing is connected to it.`,
          });
        }
      }
    }

    return warnings;
  }

  // ─── UI render state ─────────────────────────────────────────────────────

  /**
   * Get everything the UI needs to render the current board state in one call.
   * Avoids the UI having to make 20+ individual queries per frame.
   *
   * @returns {{
   *   powered: boolean,
   *   timeNs: bigint,
   *   vcc: number,
   *   leds: Array<{id: string, brightness: number, color?: string}>,
   *   buzzers: Array<{id: string, hz: number, on: boolean}>,
   *   controls: Array<{id: string, kind: string, value: number}>,
   *   pins: Array<{pin: string, mode: string, driveHigh: boolean}>,
   *   warnings: Array<{severity: string, partId?: string, message: string}>,
   *   nodeVoltages: Array<{net: string, voltage: number}>,
   *   capacitors: Array<{id: string, voltage: number}>,
   * }}
   */
  getRenderState() {
    return {
      powered: this.powered,
      timeNs: this.timeNs,
      vcc: this.vcc,
      leds: this.parts
        .filter(p => p.kind === 'led')
        .map(p => ({
          id: p.id,
          brightness: this.ledBrightness(p.id),
          color: /** @type {string | undefined} */ (p.params.color),
        })),
      buzzers: this.parts
        .filter(p => p.kind === 'buzzer')
        .map(p => ({ id: p.id, ...this.buzzerTone(p.id) })),
      controls: this.getControls(),
      pins: this.getPinStates(),
      warnings: this.getWarnings(),
      nodeVoltages: this.nets.map(n => ({
        net: n.id,
        voltage: this.nodeVoltage(n.id),
      })),
      capacitors: this.parts
        .filter(p => p.kind === 'capacitor')
        .map(p => ({ id: p.id, voltage: this.getCapVoltage(p.id) })),
    };
  }

  // ─── Reset ──────────────────────────────────────────────────────────────

  /**
   * Reset simulation state without changing the netlist.
   * Clears pin states, time, capacitor voltages, LED history, buzzer edges.
   * Parts, nets, and controls are preserved.
   */
  reset() {
    this.pinStates.clear();
    this.timeNs = 0n;
    this.capVoltages.clear();
    this.ledHistory.clear();
    this.buzzerEdges.clear();
    this.nodeVoltages.clear();
    this.ledCurrents.clear();
    this.inductorCurrents.clear();

    // Re-initialize cap voltages and LED/buzzer tracking
    for (const p of this.parts) {
      if (p.kind === 'led') this.ledHistory.set(p.id, []);
      if (p.kind === 'buzzer') this.buzzerEdges.set(p.id, []);
      if (p.kind === 'capacitor') this.capVoltages.set(p.id, 0);
    }

    this._solve();
    this._recordLedSamples();
    this._notifyChange('reset');
  }

  // ─── State snapshot ─────────────────────────────────────────────────────

  /**
   * Take a snapshot of the current board state for save/undo.
   * @returns {object}
   */
  snapshot() {
    return {
      timeNs: this.timeNs,
      powered: this.powered,
      pinStates: new Map(this.pinStates),
      controls: new Map(this.controls),
      capVoltages: new Map(this.capVoltages),
      inductorCurrents: new Map(this.inductorCurrents),
    };
  }

  /**
   * Restore a previously taken snapshot.
   * @param {object} snap
   */
  restore(snap) {
    this.timeNs = snap.timeNs;
    this.powered = snap.powered;
    this.pinStates = new Map(snap.pinStates);
    this.controls = new Map(snap.controls);
    this.capVoltages = new Map(snap.capVoltages);
    this.inductorCurrents = new Map(snap.inductorCurrents ?? []);

    // Re-initialize LED/buzzer tracking
    this.ledHistory.clear();
    this.buzzerEdges.clear();
    for (const p of this.parts) {
      if (p.kind === 'led') this.ledHistory.set(p.id, []);
      if (p.kind === 'buzzer') this.buzzerEdges.set(p.id, []);
    }

    this._solve();
    this._recordLedSamples();
    this._notifyChange('restore');
  }

  // ─── Internal: MNA solver bridge ──────────────────────────────────────────

  /**
   * Run the MNA solver on the current netlist.
   * @param {boolean} powerOff - if true, omit active sources (for resistance)
   * @param {string} [testNodeA] - inject test current from this net
   * @param {string} [testNodeB] - inject test current to this net
   * @param {number} [testCurrent] - test current magnitude
   */
  _solveMNA(powerOff, testNodeA, testNodeB, testCurrent) {
    // Build pin source map from current pin states
    /** @type {Map<string, import('./types.js').TheveninSource>} */
    const pinSources = new Map();
    for (const [pinId, state] of this.pinStates) {
      pinSources.set(pinId, pinThevenin(state.mode, state.driveHigh, this.vcc));
    }

    return solveMNA(this.parts, this.nets, pinSources, this.controls, this.vcc, {
      powerOff,
      testNodeA,
      testNodeB,
      testCurrent,
    });
  }

  // ─── Internal: capacitor RC integration ───────────────────────────────────

  /**
   * Integrate capacitor voltages using closed-form RC step.
   * V += (Vt − V) · (1 − e^(−dt/RC))
   * where Vt is the target voltage from the driving source and RC is the
   * time constant.
   *
   * @param {number} dtSec - time step in seconds
   */
  _integrateCapacitors(dtSec) {
    // Temporarily strip cached voltages from non-ideal-source nets so
    // _gatherSources traces all the way to VCC/GND/pin Thévenins and
    // accumulates the real source impedance. Without this, a net like
    // "MCU quasi-high → 10kΩ pull-up net" gets cached as V=5V (correct)
    // but with implied R=0 (wrong — the quasi pin has 21.7kΩ behind it).
    const savedVoltages = new Map(this.nodeVoltages);
    const idealNets = new Set();
    for (const net of this.nets) {
      for (const t of net.terminals) {
        const p = this.partMap.get(t.part);
        if (p && (p.kind === 'vcc' || p.kind === 'gnd')) {
          idealNets.add(net.id);
        }
      }
    }
    // Keep only VCC/GND net voltages
    for (const [netId] of this.nodeVoltages) {
      if (!idealNets.has(netId)) {
        this.nodeVoltages.delete(netId);
      }
    }

    for (const part of this.parts) {
      if (part.kind !== 'capacitor') continue;

      const farads = /** @type {number} */ (part.params.farads ?? 0.0001);
      const netA = this._netForTerminal(part.id, 'a');
      const netB = this._netForTerminal(part.id, 'b');
      if (!netA || !netB) continue;

      // Use _gatherSources to find ALL Thévenin sources reaching each
      // terminal, including their series resistance. This is critical:
      // _traceToSource stops at cached node voltages and loses the source
      // impedance behind them (e.g., a quasi pin's 21.7kΩ behind a net
      // that _resolveNet cached as "5V").
      const aSources = this._gatherSources(netA);
      const bSources = this._gatherSources(netB);

      // Remove any sources from the cap's own side (avoid self-reference)
      // gatherSources already skips the cap because it doesn't trace
      // through capacitors.

      if (aSources.length === 0 && bSources.length === 0) continue;

      // Combine each side into a single Thévenin equivalent via Norton.
      const aThev = combineThevenin(aSources);
      const bThev = combineThevenin(bSources);

      if (!aThev && !bThev) continue;

      const vTarget = (aThev ? aThev.vTh : 0) - (bThev ? bThev.vTh : 0);
      const rSource = (aThev ? aThev.rTh : 0) + (bThev ? bThev.rTh : 0);

      if (rSource <= 0) continue;

      const rc = rSource * farads;
      const vCap = this.capVoltages.get(part.id) ?? 0;
      const vNew = vCap + (vTarget - vCap) * (1 - Math.exp(-dtSec / rc));

      this.capVoltages.set(part.id, vNew);

      // Update node voltages for the capacitor's terminals
      // The capacitor voltage determines the node voltage at its "a" terminal
      // relative to "b"
      const vB = this.nodeVoltages.get(netB) ?? 0;
      this.nodeVoltages.set(netA, vB + vNew);
    }

    // Restore cached voltages for non-cap nets
    for (const [netId, v] of savedVoltages) {
      if (!this.nodeVoltages.has(netId)) {
        this.nodeVoltages.set(netId, v);
      }
    }
  }

  // ─── Internal: closed-form solver ────────────────────────────────────────

  /**
   * Resolve node voltages for the current state. Closed-form only.
   *
   * Strategy: walk each net and determine its voltage from the sources
   * connected to it (VCC, GND, pin Thévenin equivalents, potentiometer wipers).
   * For simple series chains (pin → resistor → LED → net), solve the loop
   * analytically.
   */
  _solve() {
    this.nodeVoltages.clear();
    this.ledCurrents.clear();

    if (!this.powered) return;

    // Set known voltages: VCC and GND nets
    for (const net of this.nets) {
      for (const t of net.terminals) {
        const part = this.partMap.get(t.part);
        if (!part) continue;
        if (part.kind === 'vcc') {
          this.nodeVoltages.set(net.id, this.vcc);
        } else if (part.kind === 'gnd') {
          this.nodeVoltages.set(net.id, 0);
        }
      }
    }

    // Resolve potentiometer wipers
    for (const part of this.parts) {
      if (part.kind === 'potentiometer') {
        this._solvePot(part);
      }
    }

    // Resolve LED chains: find LEDs and trace their series path
    for (const part of this.parts) {
      if (part.kind === 'led') {
        this._solveLedChain(part);
      }
    }

    // Resolve remaining unresolved nets (e.g. pull-up/pull-down to an input pin).
    // For each unresolved net, trace through resistors/buttons to find a voltage source.
    // If there's no load (only high-Z connections), voltage equals the source voltage.
    for (const net of this.nets) {
      if (this.nodeVoltages.has(net.id)) continue;
      this._resolveNet(net);
    }

    // Override net voltages for capacitor nodes with their actual charge state.
    // The static solve gives the long-term target voltage; the cap's current
    // charge may be different (it hasn't reached steady state yet).
    for (const part of this.parts) {
      if (part.kind !== 'capacitor') continue;
      const capV = this.capVoltages.get(part.id);
      if (capV === undefined) continue;
      const netA = this._netForTerminal(part.id, 'a');
      const netB = this._netForTerminal(part.id, 'b');
      if (netA) {
        const vB = netB ? (this.nodeVoltages.get(netB) ?? 0) : 0;
        this.nodeVoltages.set(netA, vB + capV);
      }
    }
  }

  /**
   * Resolve a net's voltage by finding all Thévenin sources connected to it
   * (through resistors, buttons, or directly). Combines parallel sources.
   * High-Z connections (input pins, open buttons) contribute nothing.
   *
   * @param {Net} net
   */
  _resolveNet(net) {
    // Gather all Thévenin sources reaching this net
    const sources = this._gatherSources(net.id);
    if (sources.length === 0) return;

    if (sources.length === 1) {
      // Single source: voltage is Vth (no current flows through the series R
      // because there's no other path — only high-Z loads)
      this.nodeVoltages.set(net.id, sources[0].vTh);
      return;
    }

    // Multiple sources: combine in parallel using Norton equivalent.
    // I_total = Σ(Vth_i / Rth_i), G_total = Σ(1 / Rth_i)
    // V_node = I_total / G_total
    let iTotal = 0;
    let gTotal = 0;
    for (const s of sources) {
      if (s.rTh <= 0) { s.rTh = 0.001; } // avoid division by zero
      gTotal += 1 / s.rTh;
      iTotal += s.vTh / s.rTh;
    }
    this.nodeVoltages.set(net.id, gTotal > 0 ? iTotal / gTotal : 0);
  }

  /**
   * Gather Thévenin sources that can reach a net (directly or through
   * resistors/closed buttons). Does not follow through LEDs or buzzers.
   *
   * @param {string} netId
   * @returns {Array<{vTh: number, rTh: number}>}
   */
  _gatherSources(netId) {
    /** @type {Array<{vTh: number, rTh: number}>} */
    const sources = [];
    this._gatherSourcesInner(netId, new Set(), 0, sources);
    return sources;
  }

  /**
   * @param {string} netId
   * @param {Set<string>} visited
   * @param {number} rAccum
   * @param {Array<{vTh: number, rTh: number}>} out
   */
  _gatherSourcesInner(netId, visited, rAccum, out) {
    // If this net has a known voltage, it's a terminal source —
    // return it without marking visited, so parallel paths to the
    // same known net (e.g. two resistors both to GND) are all found.
    const knownV = this.nodeVoltages.get(netId);
    if (knownV !== undefined) {
      out.push({ vTh: knownV, rTh: rAccum });
      return;
    }

    if (visited.has(netId)) return;
    visited.add(netId);

    const net = this.netMap.get(netId);
    if (!net) return;

    for (const t of net.terminals) {
      const part = this.partMap.get(t.part);
      if (!part) continue;

      switch (part.kind) {
        case 'vcc':
          out.push({ vTh: this.vcc, rTh: rAccum });
          break;
        case 'gnd':
          out.push({ vTh: 0, rTh: rAccum });
          break;
        case 'mcu': {
          const state = this.pinStates.get(t.terminal);
          if (!state) break;
          const thev = pinThevenin(state.mode, state.driveHigh, this.vcc);
          if (thev !== 'high-z') {
            out.push({ vTh: thev.vTh, rTh: rAccum + thev.rTh });
          }
          break;
        }
        case 'resistor': {
          const ohms = /** @type {number} */ (part.params.ohms ?? 1000);
          const otherT = t.terminal === 'a' ? 'b' : 'a';
          const otherNet = this._netForTerminal(part.id, otherT);
          if (otherNet) {
            this._gatherSourcesInner(otherNet, visited, rAccum + ohms, out);
          }
          break;
        }
        case 'inductor': {
          // DC steady state: inductor is a wire (zero resistance)
          const otherT = t.terminal === 'a' ? 'b' : 'a';
          const otherNet = this._netForTerminal(part.id, otherT);
          if (otherNet) {
            this._gatherSourcesInner(otherNet, visited, rAccum, out);
          }
          break;
        }
        case 'ldr': {
          // Photoresistor: control 0…1 maps to resistance range.
          // 0 = dark (high R, e.g. 1MΩ), 1 = bright (low R, e.g. 100Ω).
          const rDark = /** @type {number} */ (part.params.rDark ?? 1000000);
          const rLight = /** @type {number} */ (part.params.rLight ?? 100);
          const light = this.controls.get(part.id) ?? 0;
          const ohms = rDark * Math.pow(rLight / rDark, light);
          const otherT = t.terminal === 'a' ? 'b' : 'a';
          const otherNet = this._netForTerminal(part.id, otherT);
          if (otherNet) {
            this._gatherSourcesInner(otherNet, visited, rAccum + ohms, out);
          }
          break;
        }
        case 'ntc': {
          // NTC thermistor: control 0…1 maps from cold (high R) to hot (low R).
          // Simplified: exponential interpolation between rCold and rHot.
          const rCold = /** @type {number} */ (part.params.rCold ?? 100000);
          const rHot = /** @type {number} */ (part.params.rHot ?? 1000);
          const temp = this.controls.get(part.id) ?? 0;
          const ohms = rCold * Math.pow(rHot / rCold, temp);
          const otherT = t.terminal === 'a' ? 'b' : 'a';
          const otherNet = this._netForTerminal(part.id, otherT);
          if (otherNet) {
            this._gatherSourcesInner(otherNet, visited, rAccum + ohms, out);
          }
          break;
        }
        case 'button':
        case 'switch': {
          const pressed = (this.controls.get(part.id) ?? 0) === 1;
          if (!pressed) break;
          const otherT = t.terminal === 'a' ? 'b' : 'a';
          const otherNet = this._netForTerminal(part.id, otherT);
          if (otherNet) {
            this._gatherSourcesInner(otherNet, visited, rAccum, out);
          }
          break;
        }
        case 'potentiometer': {
          if (t.terminal === 'wiper') {
            const wiperNet = this._netForTerminal(part.id, 'wiper');
            if (wiperNet) {
              const wV = this.nodeVoltages.get(wiperNet);
              if (wV !== undefined) {
                out.push({ vTh: wV, rTh: rAccum });
              }
            }
          }
          break;
        }
        // LEDs, buzzers, capacitors: not followed through
      }
    }
  }

  /**
   * Solve a potentiometer: wiper voltage = VCC × position.
   * Assumes terminals are ["a", "b", "wiper"] with a→VCC, b→GND.
   * @param {Part} pot
   */
  _solvePot(pot) {
    const position = this.controls.get(pot.id) ?? 0.5;
    // Find the nets connected to terminals a and b
    const netA = this._netForTerminal(pot.id, 'a');
    const netB = this._netForTerminal(pot.id, 'b');
    const netW = this._netForTerminal(pot.id, 'wiper');

    if (!netA || !netB || !netW) return;

    const vA = this.nodeVoltages.get(netA) ?? 0;
    const vB = this.nodeVoltages.get(netB) ?? 0;

    // Wiper voltage: linear interpolation from b to a
    const vWiper = vB + (vA - vB) * position;
    this.nodeVoltages.set(netW, vWiper);
  }

  /**
   * Solve an LED in a series chain. Traces from the LED's anode and cathode
   * back to voltage sources (VCC/GND/pin Thévenin) through resistors,
   * then solves the loop analytically.
   *
   * @param {Part} led
   */
  _solveLedChain(led) {
    const vf = /** @type {number} */ (led.params.vf ?? LED_VF);
    const rd = LED_RD;

    // LED terminals: "anode" and "cathode"
    const anodeNet = this._netForTerminal(led.id, 'anode');
    const cathodeNet = this._netForTerminal(led.id, 'cathode');
    if (!anodeNet || !cathodeNet) return;

    // Trace from anode side: find the Thévenin source looking outward
    const anodeSource = this._traceToSource(anodeNet, led.id);
    // Trace from cathode side
    const cathodeSource = this._traceToSource(cathodeNet, led.id);

    if (!anodeSource || !cathodeSource) return;

    // Both sides resolved: solve the loop.
    // Convention: current flows anode → cathode (positive = LED is forward-biased).
    // V_anode_source - I*R_anode - Vf - I*Rd - I*R_cathode - V_cathode_source = 0
    // (Vth_a - Vth_c - Vf) = I * (Rth_a + Rd + Rth_c)

    const vDiff = anodeSource.vTh - cathodeSource.vTh;
    const rTotal = anodeSource.rTh + rd + cathodeSource.rTh;

    let current;
    if (vDiff >= vf) {
      // Forward biased, above threshold
      current = (vDiff - vf) / rTotal;
    } else {
      // Below threshold or reverse biased — no current
      current = 0;
    }

    this.ledCurrents.set(led.id, current);

    // Set node voltages at the LED terminals
    // V_anode_node = V_anode_source - I * R_anode_source
    this.nodeVoltages.set(anodeNet, anodeSource.vTh - current * anodeSource.rTh);
    this.nodeVoltages.set(cathodeNet, cathodeSource.vTh + current * cathodeSource.rTh);
  }

  /**
   * Trace from a net outward (excluding `excludePart`) to find a Thévenin
   * equivalent source. Follows through resistors, buttons (closed = wire),
   * to reach VCC, GND, or an MCU pin.
   *
   * Returns {vTh, rTh} accumulated along the path, or null if no source found.
   *
   * @param {string} netId
   * @param {string} excludePart - part to exclude (the LED we're tracing from)
   * @returns {{ vTh: number; rTh: number } | null}
   */
  _traceToSource(netId, excludePart) {
    return this._traceToSourceInner(netId, excludePart, new Set(), 0);
  }

  /**
   * @param {string} netId
   * @param {string} excludePart
   * @param {Set<string>} visited - nets already visited (cycle detection)
   * @param {number} rAccum - resistance accumulated so far
   * @returns {{ vTh: number; rTh: number } | null}
   */
  _traceToSourceInner(netId, excludePart, visited, rAccum) {
    if (visited.has(netId)) return null;
    visited.add(netId);

    const net = this.netMap.get(netId);
    if (!net) return null;

    // Check if this net has a known voltage source
    const knownV = this.nodeVoltages.get(netId);
    if (knownV !== undefined) {
      return { vTh: knownV, rTh: rAccum };
    }

    // Look at parts connected to this net (excluding the one we came from)
    for (const t of net.terminals) {
      if (t.part === excludePart) continue;

      const part = this.partMap.get(t.part);
      if (!part) continue;

      switch (part.kind) {
        case 'vcc':
          return { vTh: this.vcc, rTh: rAccum };

        case 'gnd':
          return { vTh: 0, rTh: rAccum };

        case 'mcu': {
          // The terminal name is the PinId
          const pinId = t.terminal;
          const state = this.pinStates.get(pinId);
          if (!state) continue;
          const thev = pinThevenin(state.mode, state.driveHigh, this.vcc);
          if (thev === 'high-z') continue;
          return { vTh: thev.vTh, rTh: rAccum + thev.rTh };
        }

        case 'resistor': {
          const ohms = /** @type {number} */ (part.params.ohms ?? 1000);
          const otherTerminal = t.terminal === 'a' ? 'b' : 'a';
          const otherNet = this._netForTerminal(part.id, otherTerminal);
          if (!otherNet) continue;
          const result = this._traceToSourceInner(
            otherNet, part.id, visited, rAccum + ohms
          );
          if (result) return result;
          break;
        }

        case 'inductor': {
          // DC: wire (zero resistance)
          const otherTerminal = t.terminal === 'a' ? 'b' : 'a';
          const otherNet = this._netForTerminal(part.id, otherTerminal);
          if (!otherNet) continue;
          const result = this._traceToSourceInner(otherNet, part.id, visited, rAccum);
          if (result) return result;
          break;
        }

        case 'ldr': {
          const rDark = /** @type {number} */ (part.params.rDark ?? 1000000);
          const rLight = /** @type {number} */ (part.params.rLight ?? 100);
          const light = this.controls.get(part.id) ?? 0;
          const ohms = rDark * Math.pow(rLight / rDark, light);
          const otherTerminal = t.terminal === 'a' ? 'b' : 'a';
          const otherNet = this._netForTerminal(part.id, otherTerminal);
          if (!otherNet) continue;
          const result = this._traceToSourceInner(otherNet, part.id, visited, rAccum + ohms);
          if (result) return result;
          break;
        }

        case 'ntc': {
          const rCold = /** @type {number} */ (part.params.rCold ?? 100000);
          const rHot = /** @type {number} */ (part.params.rHot ?? 1000);
          const temp = this.controls.get(part.id) ?? 0;
          const ohms = rCold * Math.pow(rHot / rCold, temp);
          const otherTerminal = t.terminal === 'a' ? 'b' : 'a';
          const otherNet = this._netForTerminal(part.id, otherTerminal);
          if (!otherNet) continue;
          const result = this._traceToSourceInner(otherNet, part.id, visited, rAccum + ohms);
          if (result) return result;
          break;
        }

        case 'button':
        case 'switch': {
          const pressed = (this.controls.get(part.id) ?? 0) === 1;
          if (!pressed) continue; // open = no connection
          const otherTerminal = t.terminal === 'a' ? 'b' : 'a';
          const otherNet = this._netForTerminal(part.id, otherTerminal);
          if (!otherNet) continue;
          const result = this._traceToSourceInner(
            otherNet, part.id, visited, rAccum
          );
          if (result) return result;
          break;
        }

        case 'potentiometer': {
          // If connected to the wiper, return the wiper voltage
          if (t.terminal === 'wiper') {
            const wiperNet = this._netForTerminal(part.id, 'wiper');
            if (wiperNet) {
              const wV = this.nodeVoltages.get(wiperNet);
              if (wV !== undefined) {
                return { vTh: wV, rTh: rAccum };
              }
            }
          }
          break;
        }
      }
    }

    return null;
  }

  /**
   * Find the voltage at an MCU pin by looking at the net it's connected to.
   * @param {PinId} pin
   * @returns {number}
   */
  _pinVoltage(pin) {
    // Find the MCU part and the net this pin is connected to
    for (const net of this.nets) {
      for (const t of net.terminals) {
        const part = this.partMap.get(t.part);
        if (part && part.kind === 'mcu' && t.terminal === pin) {
          return this.nodeVoltages.get(net.id) ?? 0;
        }
      }
    }
    return 0;
  }

  /**
   * Find the net connected to a specific terminal of a part.
   * @param {string} partId
   * @param {string} terminal
   * @returns {string | undefined} net id
   */
  _netForTerminal(partId, terminal) {
    for (const net of this.nets) {
      for (const t of net.terminals) {
        if (t.part === partId && t.terminal === terminal) {
          return net.id;
        }
      }
    }
    return undefined;
  }

  /**
   * Record current LED current values as samples for brightness integration.
   */
  _recordLedSamples() {
    for (const [partId, history] of this.ledHistory) {
      const current = this.ledCurrents.get(partId) ?? 0;

      // Deduplicate: if the last sample has the same current and time, skip
      const last = history.length > 0 ? history[history.length - 1] : null;
      if (last && last.tNs === this.timeNs && last.current === current) continue;

      // If the time hasn't changed but current has, update in place
      if (last && last.tNs === this.timeNs) {
        last.current = current;
        continue;
      }

      history.push({ tNs: this.timeNs, current });

      // Prune old samples, but always keep at least one sample before
      // the brightness window start so the integrator has an initial value.
      // Window starts at now - BRIGHTNESS_WINDOW_NS.
      const windowStart = this.timeNs > BRIGHTNESS_WINDOW_NS
        ? this.timeNs - BRIGHTNESS_WINDOW_NS
        : 0n;

      // Keep the most recent sample at or before windowStart, remove everything before it
      let keepIdx = -1;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].tNs <= windowStart) {
          keepIdx = i;
          break;
        }
      }
      if (keepIdx > 0) {
        history.splice(0, keepIdx);
      }
    }
  }

  /**
   * Check if a pin change affects a buzzer and record the edge.
   * @param {PinId} pin
   */
  _recordBuzzerEdges(pin) {
    // Find buzzers connected to a net that includes this pin
    for (const part of this.parts) {
      if (part.kind !== 'buzzer') continue;
      // Check if this buzzer shares a net with the pin
      const buzzerNet = this._netForTerminal(part.id, 'a') ||
                        this._netForTerminal(part.id, 'b');
      if (!buzzerNet) continue;

      const net = this.netMap.get(buzzerNet);
      if (!net) continue;

      for (const t of net.terminals) {
        const p = this.partMap.get(t.part);
        if (p && p.kind === 'mcu' && t.terminal === pin) {
          const edges = this.buzzerEdges.get(part.id);
          if (edges) {
            edges.push(this.timeNs);
            // Keep only recent edges
            while (edges.length > 100) edges.shift();
          }
          break;
        }
      }
    }
  }
}
