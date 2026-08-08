/**
 * Netlist builder — a fluent API that makes it hard to build an invalid netlist.
 *
 * Instead of manually constructing parts[] and nets[] arrays (where wrong
 * terminal names silently produce plausible wrong answers), use the builder:
 *
 *   const { parts, nets } = new NetlistBuilder()
 *     .vcc('V1')
 *     .gnd('G1')
 *     .resistor('R1', 1000)
 *     .led('LED1', 2.0, 'red')
 *     .mcu('MCU', ['P1.0'])
 *     .wire('V1.vcc', 'R1.a')
 *     .wire('R1.b', 'LED1.anode')
 *     .wire('LED1.cathode', 'MCU.P1.0')
 *     .build();
 *
 * Terminal names are validated at wire() time. Unknown terminals throw immediately.
 *
 * @module
 */

/** @typedef {import('./types.js').Part} Part */
/** @typedef {import('./types.js').Net} Net */

/**
 * Known terminal names per part kind.
 * @type {Record<string, string[]>}
 */
const TERMINALS = {
  vcc: ['vcc'],
  gnd: ['gnd'],
  resistor: ['a', 'b'],
  capacitor: ['a', 'b'],
  inductor: ['a', 'b'],
  diode: ['anode', 'cathode'],
  led: ['anode', 'cathode'],
  zener: ['anode', 'cathode'],
  potentiometer: ['a', 'b', 'wiper'],
  button: ['a', 'b'],
  switch: ['a', 'b'],
  buzzer: ['a', 'b'],
  ldr: ['a', 'b'],
  ntc: ['a', 'b'],
  npn: ['base', 'collector', 'emitter'],
  pnp: ['base', 'collector', 'emitter'],
};

export class NetlistBuilder {
  constructor() {
    /** @type {Part[]} */
    this._parts = [];
    /** @type {Map<string, Part>} */
    this._partMap = new Map();
    /** @type {Map<string, Set<string>>} netId → set of "partId.terminal" */
    this._netMembers = new Map();
    /** @type {number} */
    this._netCounter = 0;
  }

  // ─── Part adders ────────────────────────────────────────────────────────

  vcc(id) { return this._addPart(id, 'vcc', {}, TERMINALS.vcc); }
  gnd(id) { return this._addPart(id, 'gnd', {}, TERMINALS.gnd); }

  resistor(id, ohms) {
    return this._addPart(id, 'resistor', { ohms }, TERMINALS.resistor);
  }

  capacitor(id, farads) {
    return this._addPart(id, 'capacitor', { farads }, TERMINALS.capacitor);
  }

  inductor(id, henrys) {
    return this._addPart(id, 'inductor', { henrys }, TERMINALS.inductor);
  }

  led(id, vf = 2.0, color = 'red') {
    return this._addPart(id, 'led', { vf, color }, TERMINALS.led);
  }

  diode(id, vf = 0.7) {
    return this._addPart(id, 'diode', { vf }, TERMINALS.diode);
  }

  zener(id, vf = 0.7, vz = 5.1) {
    return this._addPart(id, 'zener', { vf, vz }, TERMINALS.zener);
  }

  potentiometer(id, ohms = 10000) {
    return this._addPart(id, 'potentiometer', { ohms }, TERMINALS.potentiometer);
  }

  button(id) { return this._addPart(id, 'button', {}, TERMINALS.button); }
  switch(id) { return this._addPart(id, 'switch', {}, TERMINALS.switch); }
  buzzer(id) { return this._addPart(id, 'buzzer', {}, TERMINALS.buzzer); }

  ldr(id, rDark = 1000000, rLight = 100) {
    return this._addPart(id, 'ldr', { rDark, rLight }, TERMINALS.ldr);
  }

  ntc(id, rCold = 100000, rHot = 1000) {
    return this._addPart(id, 'ntc', { rCold, rHot }, TERMINALS.ntc);
  }

  npn(id, beta = 100, vbe = 0.7) {
    return this._addPart(id, 'npn', { beta, vbe }, TERMINALS.npn);
  }

  pnp(id, beta = 100, vbe = 0.7) {
    return this._addPart(id, 'pnp', { beta, vbe }, TERMINALS.pnp);
  }

  /** MCU with arbitrary pin terminals. */
  mcu(id, pinIds) {
    return this._addPart(id, 'mcu', {}, pinIds);
  }

  // ─── Wiring ─────────────────────────────────────────────────────────────

  /**
   * Connect two terminals. Each is "partId.terminalName".
   * Creates or extends a net to include both terminals.
   *
   * @param {string} a - e.g. "R1.a" or "LED1.anode"
   * @param {string} b - e.g. "VCC.vcc" or "MCU.P1.0"
   * @returns {this}
   */
  wire(a, b) {
    this._validateTerminalRef(a);
    this._validateTerminalRef(b);

    // Find existing nets containing a or b
    let netA = this._findNet(a);
    let netB = this._findNet(b);

    if (netA && netB && netA === netB) {
      // Already on the same net
      return this;
    }

    if (netA && netB) {
      // Merge netB into netA
      const membersB = this._netMembers.get(netB);
      const membersA = this._netMembers.get(netA);
      for (const m of membersB) membersA.add(m);
      this._netMembers.delete(netB);
    } else if (netA) {
      this._netMembers.get(netA).add(b);
    } else if (netB) {
      this._netMembers.get(netB).add(a);
    } else {
      // New net
      const netId = `net_${this._netCounter++}`;
      this._netMembers.set(netId, new Set([a, b]));
    }

    return this;
  }

  // ─── Editing ─────────────────────────────────────────────────────────────

  /**
   * Remove a part and all its wiring.
   * @param {string} id
   * @returns {this}
   */
  removePart(id) {
    const part = this._partMap.get(id);
    if (!part) return this;

    this._parts = this._parts.filter(p => p.id !== id);
    this._partMap.delete(id);

    // Remove all net memberships that reference this part
    for (const [netId, members] of this._netMembers) {
      for (const m of [...members]) {
        if (m.startsWith(id + '.')) members.delete(m);
      }
      if (members.size <= 1) this._netMembers.delete(netId);
    }

    return this;
  }

  /**
   * Disconnect a terminal from its net.
   * @param {string} ref - e.g. "R1.a"
   * @returns {this}
   */
  unwire(ref) {
    for (const [netId, members] of this._netMembers) {
      if (members.has(ref)) {
        members.delete(ref);
        if (members.size <= 1) this._netMembers.delete(netId);
        break;
      }
    }
    return this;
  }

  /**
   * Check if a terminal is currently wired to anything.
   * @param {string} ref - e.g. "R1.a"
   * @returns {boolean}
   */
  isWired(ref) {
    for (const members of this._netMembers.values()) {
      if (members.has(ref)) return true;
    }
    return false;
  }

  // ─── Build ──────────────────────────────────────────────────────────────

  /**
   * Build the parts and nets arrays, ready for setNetlist.
   * @returns {{ parts: Part[], nets: Net[] }}
   */
  build() {
    const nets = [];
    for (const [netId, members] of this._netMembers) {
      const terminals = [...members].map(ref => {
        const [part, terminal] = this._splitRef(ref);
        return { part, terminal };
      });
      nets.push({ id: netId, terminals });
    }
    return { parts: [...this._parts], nets };
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  _addPart(id, kind, params, terminals) {
    if (this._partMap.has(id)) {
      throw new Error(`Duplicate part id "${id}"`);
    }
    const part = { id, kind, params, terminals: [...terminals] };
    this._parts.push(part);
    this._partMap.set(id, part);
    return this;
  }

  _validateTerminalRef(ref) {
    const [partId, terminal] = this._splitRef(ref);
    const part = this._partMap.get(partId);
    if (!part) {
      throw new Error(`Unknown part "${partId}" in "${ref}". Add the part before wiring it.`);
    }
    if (!part.terminals.includes(terminal)) {
      throw new Error(
        `Part "${partId}" (${part.kind}) has no terminal "${terminal}". ` +
        `Valid terminals: ${part.terminals.join(', ')}`
      );
    }
  }

  _splitRef(ref) {
    const dot = ref.indexOf('.');
    if (dot < 0) throw new Error(`Invalid terminal reference "${ref}". Use "partId.terminalName".`);
    return [ref.slice(0, dot), ref.slice(dot + 1)];
  }

  _findNet(ref) {
    for (const [netId, members] of this._netMembers) {
      if (members.has(ref)) return netId;
    }
    return null;
  }
}
