/**
 * Circuit model — the mutable data structure behind the circuit designer.
 *
 * Holds parts (with layout positions), nets (wires), and the board instance.
 * Every mutation that affects the netlist calls board.setNetlist() to keep
 * the engine in sync. The UI reads instrument values from the board.
 *
 * This module is the testable core — no React, no DOM, no browser APIs.
 */

import { getEngine } from '../engine.js';
import { History } from './history.js';

let _nextId = 1;
function genId(prefix) { return `${prefix}_${_nextId++}`; }

/** Reset the ID counter (for tests). */
export function resetIds() { _nextId = 1; }

/**
 * @typedef {object} PlacedPart
 * @property {string} id
 * @property {string} kind
 * @property {Record<string, number|string>} params
 * @property {string[]} terminals
 * @property {number} x — canvas X
 * @property {number} y — canvas Y
 */

/**
 * @typedef {object} Wire
 * @property {string} id
 * @property {string} netId — the net this wire belongs to
 * @property {{part: string, terminal: string}} from
 * @property {{part: string, terminal: string}} to
 */

export class Circuit {
  /**
   * @param {number} [vcc=5.0]
   */
  constructor(vcc = 5.0) {
    /** @type {number} */
    this.vcc = vcc;

    /** @type {Function} — the BoardImpl constructor, from the injected engine */
    this._BoardImpl = getEngine().BoardImpl;

    /** @type {PlacedPart[]} */
    this.parts = [];

    /** @type {Wire[]} */
    this.wires = [];

    /** @type {object} */
    this.board = new this._BoardImpl(vcc);

    /** @type {boolean} */
    this.powered = true;

    /** @type {bigint} — current simulation time in ns */
    this.timeNs = 0n;

    /** @type {History} */
    this.history = new History();
  }

  /** Save current state to history. Called after structural mutations. */
  _saveHistory() {
    this.history.save({ parts: this.parts, wires: this.wires });
  }

  /** Undo the last structural change. Returns true if successful. */
  undo() {
    const state = this.history.undo();
    if (!state) return false;
    this.parts = state.parts.map(p => ({ ...p }));
    this.wires = state.wires.map(w => ({ ...w }));
    this._syncNetlist();
    return true;
  }

  /** Redo a previously undone change. Returns true if successful. */
  redo() {
    const state = this.history.redo();
    if (!state) return false;
    this.parts = state.parts.map(p => ({ ...p }));
    this.wires = state.wires.map(w => ({ ...w }));
    this._syncNetlist();
    return true;
  }

  // ── Part operations ─────────────────────────────────────────────

  /**
   * Add a part to the circuit at the given position.
   * @param {string} kind
   * @param {Record<string, number|string>} params
   * @param {number} x
   * @param {number} y
   * @returns {PlacedPart} the added part
   */
  addPart(kind, params, x, y) {
    const terminals = terminalsForKind(kind, params);
    const part = { id: genId(kind), kind, params: { ...params }, terminals, x, y, rotation: 0 };
    this.parts.push(part);
    this._syncNetlist();
    this._saveHistory();
    return part;
  }

  /**
   * Remove a part and all wires connected to it.
   * @param {string} partId
   * @returns {boolean} true if found and removed
   */
  removePart(partId) {
    const idx = this.parts.findIndex(p => p.id === partId);
    if (idx === -1) return false;
    this.parts.splice(idx, 1);
    // Remove wires connected to this part
    this.wires = this.wires.filter(
      w => w.from.part !== partId && w.to.part !== partId
    );
    this._syncNetlist();
    this._saveHistory();
    return true;
  }

  /**
   * Move a part to a new position. Does not affect the netlist.
   * @param {string} partId
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  movePart(partId, x, y) {
    const part = this.parts.find(p => p.id === partId);
    if (!part) return false;
    part.x = x;
    part.y = y;
    return true;
  }

  /**
   * Find a part by ID.
   * @param {string} partId
   * @returns {PlacedPart|undefined}
   */
  getPart(partId) {
    return this.parts.find(p => p.id === partId);
  }

  /**
   * Rotate a part by 90 degrees clockwise.
   * @param {string} partId
   * @returns {boolean}
   */
  rotatePart(partId) {
    const part = this.getPart(partId);
    if (!part) return false;
    part.rotation = ((part.rotation || 0) + 90) % 360;
    this._saveHistory();
    return true;
  }

  /**
   * Duplicate a part at an offset position.
   * @param {string} partId
   * @param {number} [offsetX=40]
   * @param {number} [offsetY=40]
   * @returns {PlacedPart|null}
   */
  duplicatePart(partId, offsetX = 40, offsetY = 40) {
    const src = this.getPart(partId);
    if (!src) return null;
    return this.addPart(src.kind, { ...src.params }, src.x + offsetX, src.y + offsetY);
  }

  /**
   * Update a part's parameters (e.g. resistor ohms, LED color).
   * @param {string} partId
   * @param {Record<string, number|string>} newParams — merged with existing
   * @returns {boolean}
   */
  updateParams(partId, newParams) {
    const part = this.getPart(partId);
    if (!part) return false;
    Object.assign(part.params, newParams);
    this._syncNetlist();
    this._saveHistory();
    return true;
  }

  // ── Wire operations ─────────────────────────────────────────────

  /**
   * Connect two terminals with a wire.
   * If both terminals are already in the same net, does nothing.
   * If one or both are in different nets, merges them.
   *
   * @param {string} fromPart
   * @param {string} fromTerminal
   * @param {string} toPart
   * @param {string} toTerminal
   * @returns {Wire|null} the new wire, or null if invalid
   */
  addWire(fromPart, fromTerminal, toPart, toTerminal) {
    // Validate endpoints exist
    const fp = this.getPart(fromPart);
    const tp = this.getPart(toPart);
    if (!fp || !tp) return null;
    if (!fp.terminals.includes(fromTerminal)) return null;
    if (!tp.terminals.includes(toTerminal)) return null;

    // Don't wire a terminal to itself
    if (fromPart === toPart && fromTerminal === toTerminal) return null;

    // Check if already directly connected
    const existing = this.wires.find(w =>
      (w.from.part === fromPart && w.from.terminal === fromTerminal &&
       w.to.part === toPart && w.to.terminal === toTerminal) ||
      (w.from.part === toPart && w.from.terminal === toTerminal &&
       w.to.part === fromPart && w.to.terminal === fromTerminal)
    );
    if (existing) return null;

    // Find or create the net
    const fromNet = this._netForTerminal(fromPart, fromTerminal);
    const toNet = this._netForTerminal(toPart, toTerminal);

    let netId;
    if (fromNet && toNet && fromNet === toNet) {
      // Already on the same net — still add the wire for visual purposes
      netId = fromNet;
    } else if (fromNet && toNet) {
      // Merge: rename all toNet wires to fromNet
      netId = fromNet;
      for (const w of this.wires) {
        if (w.netId === toNet) w.netId = fromNet;
      }
    } else {
      netId = fromNet || toNet || genId('net');
    }

    const wire = {
      id: genId('wire'),
      netId,
      from: { part: fromPart, terminal: fromTerminal },
      to: { part: toPart, terminal: toTerminal },
    };
    this.wires.push(wire);
    this._syncNetlist();
    this._saveHistory();
    return wire;
  }

  /**
   * Remove a wire by ID.
   * @param {string} wireId
   * @returns {boolean}
   */
  removeWire(wireId) {
    const idx = this.wires.findIndex(w => w.id === wireId);
    if (idx === -1) return false;
    this.wires.splice(idx, 1);
    this._syncNetlist();
    this._saveHistory();
    return true;
  }

  /**
   * Get the net ID for a terminal, or null if not wired.
   */
  _netForTerminal(partId, terminal) {
    for (const w of this.wires) {
      if ((w.from.part === partId && w.from.terminal === terminal) ||
          (w.to.part === partId && w.to.terminal === terminal)) {
        return w.netId;
      }
    }
    return null;
  }

  // ── Interaction ─────────────────────────────────────────────────

  /**
   * Set a control value (pot position 0…1, button 0/1).
   * @param {string} partId
   * @param {number} value
   */
  setControl(partId, value) {
    this.board.setControl(partId, value);
  }

  /**
   * Set a pin state (for scripted MCU driving).
   * @param {string} pin
   * @param {string} mode
   * @param {boolean} driveHigh
   */
  setPin(pin, mode, driveHigh) {
    this.board.setPin(pin, mode, driveHigh);
  }

  /**
   * Advance simulation time.
   * @param {bigint} tNs
   */
  advanceTo(tNs) {
    this.timeNs = tNs;
    this.board.advanceTo(tNs);
  }

  /**
   * Advance by a delta.
   * @param {bigint} deltaNs
   */
  advanceBy(deltaNs) {
    this.advanceTo(this.timeNs + deltaNs);
  }

  /**
   * Toggle power.
   * @param {boolean} on
   */
  setPower(on) {
    this.powered = on;
    this.board.setPower(on);
  }

  // ── Instrument readings (all from engine) ───────────────────────

  /**
   * @param {string} partId
   * @returns {number} 0…1
   */
  ledBrightness(partId) {
    return this.board.ledBrightness(partId);
  }

  /**
   * @param {string} partId
   * @returns {{hz: number, on: boolean}}
   */
  buzzerTone(partId) {
    return this.board.buzzerTone(partId);
  }

  /**
   * @param {string} netId
   * @returns {number} volts
   */
  nodeVoltage(netId) {
    return this.board.nodeVoltage(netId);
  }

  /**
   * @param {string} partId
   * @param {string} terminal
   * @returns {number} amperes
   */
  branchCurrent(partId, terminal) {
    return this.board.branchCurrent(partId, terminal);
  }

  /**
   * @param {string} netA
   * @param {string} netB
   * @returns {number|'requires-power-off'}
   */
  resistance(netA, netB) {
    return this.board.resistance(netA, netB);
  }

  // ── Netlist sync ────────────────────────────────────────────────

  /**
   * Build the boundary-B netlist from the current parts and wires,
   * then call board.setNetlist(). This is called after every mutation.
   */
  _syncNetlist() {
    // Parts for the engine (strip layout fields)
    const engineParts = this.parts.map(p => ({
      id: p.id,
      kind: p.kind,
      params: p.params,
      terminals: p.terminals,
    }));

    // Build nets from wires
    const netMap = new Map(); // netId → Set of {part, terminal} as JSON keys
    for (const w of this.wires) {
      if (!netMap.has(w.netId)) netMap.set(w.netId, new Map());
      const net = netMap.get(w.netId);
      const fk = `${w.from.part}:${w.from.terminal}`;
      const tk = `${w.to.part}:${w.to.terminal}`;
      if (!net.has(fk)) net.set(fk, w.from);
      if (!net.has(tk)) net.set(tk, w.to);
    }

    const engineNets = [];
    for (const [netId, termMap] of netMap) {
      engineNets.push({
        id: netId,
        terminals: [...termMap.values()],
      });
    }

    this.board = new this._BoardImpl(this.vcc);
    try {
      this.board.setNetlist(engineParts, engineNets);
    } catch {
      // Partial circuit (e.g. VCC without GND) — engine validation
      // rejects incomplete netlists. This is fine during construction;
      // the next addPart/addWire will try again.
    }
  }

  // ── Serialization ───────────────────────────────────────────────

  /**
   * Export the current state as a plain object (for save/load).
   */
  toJSON() {
    return {
      vcc: this.vcc,
      parts: this.parts.map(p => ({ ...p })),
      wires: this.wires.map(w => ({ ...w })),
    };
  }

  /**
   * Load state from a plain object.
   * @param {object} data
   * @returns {Circuit}
   */
  static fromJSON(data) {
    const c = new Circuit(data.vcc);
    c.parts = data.parts.map(p => ({ ...p }));
    c.wires = data.wires.map(w => ({ ...w }));
    c._syncNetlist();
    return c;
  }
}

/**
 * Return the terminal names for a given part kind.
 */
function terminalsForKind(kind, params) {
  switch (kind) {
    case 'vcc': return ['vcc'];
    case 'gnd': return ['gnd'];
    case 'resistor': return ['a', 'b'];
    case 'capacitor': return ['a', 'b'];
    case 'diode': return ['anode', 'cathode'];
    case 'led': return ['anode', 'cathode'];
    case 'potentiometer': return ['a', 'wiper', 'b'];
    case 'button': return ['a', 'b'];
    case 'switch': return ['a', 'b'];
    case 'buzzer': return ['a', 'b'];
    case 'mcu': return params?.pins || ['P1.0'];
    default: return ['a', 'b'];
  }
}
