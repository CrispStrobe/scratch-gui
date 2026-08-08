/**
 * Boundary C integration — infer a circuit from pin declarations
 * and check for wiring issues.
 *
 * Imports inferNetlist and checkWiring from bw-board.
 * Adds layout positions so the inferred parts can be rendered.
 */

import { getEngine } from '../engine.js';

/**
 * Re-export checkWiring from the injected engine.
 */
export function checkWiring(declaredPins, wiredParts, wiredNets) {
  return getEngine().checkWiring(declaredPins, wiredParts, wiredNets);
}

/**
 * Infer a netlist from project pin declarations and add layout positions.
 *
 * Layout strategy: each pin gets a vertical column. Parts belonging to
 * that pin are arranged top-to-bottom in circuit order. VCC at top,
 * GND at bottom, MCU on the right.
 *
 * @param {object} stc — { device?, clock?, pins: StcPin[] }
 * @returns {{ parts: Array, nets: Array, notes: string[] }}
 */
export function inferCircuit(stc) {
  const { inferNetlist } = getEngine();
  const { parts, nets, notes } = inferNetlist(stc);

  // Group non-fixed parts by the pin they belong to.
  // Convention from inferNetlist: R_<name>, LED_<name>, POT_<name>, etc.
  const pinNames = stc.pins.map(p => p.name.replace(/[^a-zA-Z0-9_]/g, '_'));
  const pinParts = new Map(); // pinName → [partIds in circuit order]

  for (const part of parts) {
    if (part.id === 'VCC' || part.id === 'GND' || part.id === 'MCU') continue;
    const ownerPin = pinNames.find(name => part.id.includes(name));
    if (ownerPin) {
      if (!pinParts.has(ownerPin)) pinParts.set(ownerPin, []);
      pinParts.get(ownerPin).push(part.id);
    }
  }

  // Layout constants
  const colWidth = 140;
  const startX = 120;
  const mcuX = startX + Math.max(1, pinParts.size) * colWidth + 60;
  const mcuY = 220;
  const vccY = 50;
  const gndY = 420;

  // Position fixed parts
  const positions = new Map();
  positions.set('VCC', { x: startX, y: vccY });
  positions.set('GND', { x: startX, y: gndY });
  positions.set('MCU', { x: mcuX, y: mcuY });

  // Position per-pin parts in columns
  let colIdx = 0;
  for (const [pinName, partIds] of pinParts) {
    const colX = startX + colIdx * colWidth;
    const pin = stc.pins.find(p => p.name.replace(/[^a-zA-Z0-9_]/g, '_') === pinName);

    // Arrange vertically: top component near VCC, bottom near MCU pin
    const stepY = Math.min(80, (gndY - vccY - 100) / (partIds.length + 1));
    const topY = vccY + 60;

    for (let i = 0; i < partIds.length; i++) {
      positions.set(partIds[i], {
        x: colX,
        y: topY + i * stepY,
      });
    }
    colIdx++;
  }

  // Apply positions
  const positioned = parts.map(part => {
    const pos = positions.get(part.id) || { x: startX + colIdx * colWidth, y: 200 };
    return { ...part, x: pos.x, y: pos.y };
  });

  return { parts: positioned, nets, notes };
}
