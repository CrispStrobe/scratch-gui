/**
 * Boundary C — infer a default netlist from project.stc.pins.
 *
 * Each declared pin gets a default wiring based on its direction and
 * active-low flag. The user can then redraw any of it.
 *
 * The reverse check is the teaching feature: warn when the code drives
 * a pin with nothing attached, or when something is wired that the code
 * never references.
 *
 * @module
 */

/** @typedef {import('./types.js').Part} Part */
/** @typedef {import('./types.js').Net} Net */

/**
 * A pin declaration from the project.
 * @typedef {object} StcPin
 * @property {string} name
 * @property {number} port
 * @property {number} bit
 * @property {'output' | 'input' | 'analog'} direction
 * @property {boolean} activeLow
 */

/**
 * @typedef {object} StcProject
 * @property {string} [device]
 * @property {number} [clock]
 * @property {StcPin[]} pins
 */

/**
 * Infer a default netlist from the project's pin declarations.
 *
 * @param {StcProject} stc
 * @returns {{ parts: Part[], nets: Net[], notes: string[] }}
 */
export function inferNetlist(stc) {
  /** @type {Part[]} */
  const parts = [];
  /** @type {Net[]} */
  const nets = [];
  /** @type {string[]} */
  const notes = [];

  // Always add VCC, GND, and the MCU
  parts.push({ id: 'VCC', kind: 'vcc', params: {}, terminals: ['vcc'] });
  parts.push({ id: 'GND', kind: 'gnd', params: {}, terminals: ['gnd'] });

  // Collect MCU terminals from declared pins
  const mcuTerminals = stc.pins.map(p => `P${p.port}.${p.bit}`);
  parts.push({ id: 'MCU', kind: 'mcu', params: {}, terminals: mcuTerminals });

  // VCC and GND nets (shared by multiple parts)
  const vccNet = { id: 'net_vcc', terminals: [{ part: 'VCC', terminal: 'vcc' }] };
  const gndNet = { id: 'net_gnd', terminals: [{ part: 'GND', terminal: 'gnd' }] };

  for (const pin of stc.pins) {
    const pinId = `P${pin.port}.${pin.bit}`;
    const safeName = pin.name.replace(/[^a-zA-Z0-9_]/g, '_');

    // Detect buzzer by name convention
    const isBuzzer = /buzz|speaker|tone|beep/i.test(pin.name);

    switch (pin.direction) {
      case 'output': {
        if (isBuzzer) {
          // pin → buzzer → GND
          const buzzId = `BUZZ_${safeName}`;
          parts.push({
            id: buzzId, kind: 'buzzer',
            params: {}, terminals: ['a', 'b'],
          });
          nets.push({
            id: `net_${safeName}_pin`,
            terminals: [
              { part: 'MCU', terminal: pinId },
              { part: buzzId, terminal: 'a' },
            ],
          });
          gndNet.terminals.push({ part: buzzId, terminal: 'b' });
          break;
        }

        if (pin.activeLow) {
          // VCC → 1kΩ → LED → pin (active-low, the correct wiring)
          const rId = `R_${safeName}`;
          const ledId = `LED_${safeName}`;
          parts.push({
            id: rId, kind: 'resistor',
            params: { ohms: 1000 }, terminals: ['a', 'b'],
          });
          parts.push({
            id: ledId, kind: 'led',
            params: { vf: 2.0, color: 'red' }, terminals: ['anode', 'cathode'],
          });
          // VCC → R.a
          vccNet.terminals.push({ part: rId, terminal: 'a' });
          // R.b → LED.anode
          nets.push({
            id: `net_${safeName}_r_led`,
            terminals: [
              { part: rId, terminal: 'b' },
              { part: ledId, terminal: 'anode' },
            ],
          });
          // LED.cathode → MCU pin
          nets.push({
            id: `net_${safeName}_pin`,
            terminals: [
              { part: ledId, terminal: 'cathode' },
              { part: 'MCU', terminal: pinId },
            ],
          });
        } else {
          // pin → 1kΩ → LED → GND (active-high)
          const rId = `R_${safeName}`;
          const ledId = `LED_${safeName}`;
          parts.push({
            id: rId, kind: 'resistor',
            params: { ohms: 1000 }, terminals: ['a', 'b'],
          });
          parts.push({
            id: ledId, kind: 'led',
            params: { vf: 2.0, color: 'red' }, terminals: ['anode', 'cathode'],
          });
          // MCU pin → R.a
          nets.push({
            id: `net_${safeName}_pin_r`,
            terminals: [
              { part: 'MCU', terminal: pinId },
              { part: rId, terminal: 'a' },
            ],
          });
          // R.b → LED.anode
          nets.push({
            id: `net_${safeName}_r_led`,
            terminals: [
              { part: rId, terminal: 'b' },
              { part: ledId, terminal: 'anode' },
            ],
          });
          // LED.cathode → GND
          gndNet.terminals.push({ part: ledId, terminal: 'cathode' });
        }
        break;
      }

      case 'analog': {
        // Potentiometer across VCC/GND, wiper → pin
        const potId = `POT_${safeName}`;
        parts.push({
          id: potId, kind: 'potentiometer',
          params: { ohms: 10000 }, terminals: ['a', 'b', 'wiper'],
        });
        // VCC → pot.a
        vccNet.terminals.push({ part: potId, terminal: 'a' });
        // pot.b → GND
        gndNet.terminals.push({ part: potId, terminal: 'b' });
        // pot.wiper → MCU pin
        nets.push({
          id: `net_${safeName}_wiper`,
          terminals: [
            { part: potId, terminal: 'wiper' },
            { part: 'MCU', terminal: pinId },
          ],
        });
        break;
      }

      case 'input': {
        // Button pin → GND, plus a 10kΩ pull-up to VCC
        const rpuId = `R_PU_${safeName}`;
        const btnId = `BTN_${safeName}`;
        parts.push({
          id: rpuId, kind: 'resistor',
          params: { ohms: 10000 }, terminals: ['a', 'b'],
        });
        parts.push({
          id: btnId, kind: 'button',
          params: {}, terminals: ['a', 'b'],
        });
        // VCC → R_PU.a
        vccNet.terminals.push({ part: rpuId, terminal: 'a' });
        // R_PU.b → pin net (shared with button and MCU)
        nets.push({
          id: `net_${safeName}_pin`,
          terminals: [
            { part: rpuId, terminal: 'b' },
            { part: btnId, terminal: 'a' },
            { part: 'MCU', terminal: pinId },
          ],
        });
        // button.b → GND
        gndNet.terminals.push({ part: btnId, terminal: 'b' });
        break;
      }

      default:
        notes.push(`Unknown direction '${pin.direction}' for pin ${pin.name} (${pinId})`);
    }
  }

  // Add the shared VCC and GND nets
  nets.push(vccNet);
  nets.push(gndNet);

  return { parts, nets, notes };
}

/**
 * Check for wiring issues: pins driven with nothing attached, or parts
 * wired that the code never references.
 *
 * @param {StcPin[]} declaredPins - pins declared in the project
 * @param {Part[]} wiredParts - parts in the current netlist
 * @param {Net[]} wiredNets - nets in the current netlist
 * @returns {string[]} warning notes
 */
export function checkWiring(declaredPins, wiredParts, wiredNets) {
  /** @type {string[]} */
  const notes = [];

  // Find all MCU pin terminals in the netlist
  const mcuPart = wiredParts.find(p => p.kind === 'mcu');
  if (!mcuPart) return notes;

  const wiredPinIds = new Set();
  for (const net of wiredNets) {
    for (const t of net.terminals) {
      if (t.part === mcuPart.id) {
        wiredPinIds.add(t.terminal);
      }
    }
  }

  // Check: declared pins with nothing wired
  const declaredPinIds = new Set(declaredPins.map(p => `P${p.port}.${p.bit}`));
  for (const pin of declaredPins) {
    const pinId = `P${pin.port}.${pin.bit}`;
    if (!wiredPinIds.has(pinId)) {
      notes.push(`Pin ${pin.name} (${pinId}) is declared as ${pin.direction} but has nothing wired to it`);
    }
  }

  // Check: MCU terminals wired but not declared in the project
  for (const pinId of wiredPinIds) {
    if (!declaredPinIds.has(pinId)) {
      notes.push(`${pinId} has wiring on the board but is not declared in the project`);
    }
  }

  // Check: wired pins with only their own connection (no external parts)
  for (const net of wiredNets) {
    const mcuTerminals = net.terminals.filter(t => t.part === mcuPart.id);
    if (mcuTerminals.length > 0 && net.terminals.length === 1) {
      for (const t of mcuTerminals) {
        const pin = declaredPins.find(p => `P${p.port}.${p.bit}` === t.terminal);
        const name = pin ? `${pin.name} (${t.terminal})` : t.terminal;
        notes.push(`${name} is connected to a net with no external components`);
      }
    }
  }

  return notes;
}
