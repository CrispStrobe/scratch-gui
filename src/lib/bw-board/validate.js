/**
 * Netlist validation — catch misuse before the solver silently produces
 * plausible wrong answers.
 *
 * The board returned brightness 0 and a node at 5V when fed a netlist
 * with {a,b} instead of {anode,cathode} for an LED. That is the same
 * failure mode as a lying multimeter: a plausible, wrong answer.
 *
 * @module
 */

/** @typedef {import('./types.js').Part} Part */
/** @typedef {import('./types.js').Net} Net */

/**
 * Known terminal names for each part kind.
 * @type {Record<string, string[] | null>}
 */
const KNOWN_TERMINALS = {
  vcc: ['vcc'],
  gnd: ['gnd'],
  resistor: ['a', 'b'],
  capacitor: ['a', 'b'],
  diode: ['anode', 'cathode'],
  led: ['anode', 'cathode'],
  potentiometer: ['a', 'b', 'wiper'],
  button: ['a', 'b'],
  switch: ['a', 'b'],
  buzzer: ['a', 'b'],
  ldr: ['a', 'b'],
  ntc: ['a', 'b'],
  npn: ['base', 'collector', 'emitter'],
  pnp: ['base', 'collector', 'emitter'],
  inductor: ['a', 'b'],
  zener: ['anode', 'cathode'],
  seven_segment: null, // composite — sub-parts have their own terminals
  rgb_led: null, // composite
  mcu: null, // terminals are PinIds, validated separately
};

/**
 * Required parameters for each part kind.
 * @type {Record<string, string[]>}
 */
const REQUIRED_PARAMS = {
  resistor: ['ohms'],
  capacitor: ['farads'],
  led: [], // vf has a default
  diode: [], // vf has a default
  potentiometer: ['ohms'],
  ldr: [], // rDark/rLight have defaults
  ntc: [], // rCold/rHot have defaults
  npn: [], // beta/vbe have defaults
  pnp: [], // beta/vbe have defaults
  zener: [], // vf/vz have defaults
  inductor: ['henrys'],
};

/**
 * @typedef {object} ValidationError
 * @property {'error' | 'warning'} severity
 * @property {string} message
 * @property {string} [partId]
 * @property {string} [netId]
 */

/**
 * Validate a netlist before passing it to setNetlist.
 *
 * @param {Part[]} parts
 * @param {Net[]} nets
 * @returns {ValidationError[]}
 */
export function validateNetlist(parts, nets) {
  /** @type {ValidationError[]} */
  const errors = [];

  const partIds = new Set();
  const netIds = new Set();

  // ─── Part validation ────────────────────────────────────────────────

  for (const part of parts) {
    // Duplicate part IDs
    if (partIds.has(part.id)) {
      errors.push({ severity: 'warning', message: `Duplicate part id "${part.id}"`, partId: part.id });
    }
    partIds.add(part.id);

    // Unknown part kind
    if (!(part.kind in KNOWN_TERMINALS)) {
      errors.push({
        severity: 'error',
        message: `Unknown part kind "${part.kind}" for part "${part.id}". Known kinds: ${Object.keys(KNOWN_TERMINALS).join(', ')}`,
        partId: part.id,
      });
      continue;
    }

    // Terminal validation
    const expectedTerminals = KNOWN_TERMINALS[part.kind];
    if (expectedTerminals !== null) {
      for (const t of part.terminals) {
        if (!expectedTerminals.includes(t)) {
          errors.push({
            severity: 'error',
            message: `Part "${part.id}" (${part.kind}) has unknown terminal "${t}". Expected: ${expectedTerminals.join(', ')}`,
            partId: part.id,
          });
        }
      }

      // Missing required terminals
      for (const t of expectedTerminals) {
        if (!part.terminals.includes(t)) {
          errors.push({
            severity: 'warning',
            message: `Part "${part.id}" (${part.kind}) is missing terminal "${t}"`,
            partId: part.id,
          });
        }
      }
    }

    // Parameter validation
    const requiredParams = REQUIRED_PARAMS[part.kind];
    if (requiredParams) {
      for (const p of requiredParams) {
        if (part.params[p] === undefined) {
          errors.push({
            severity: 'warning',
            message: `Part "${part.id}" (${part.kind}) is missing required param "${p}"`,
            partId: part.id,
          });
        }
      }
    }

    // Param value validation
    if (part.params.ohms !== undefined) {
      const v = /** @type {number} */ (part.params.ohms);
      if (typeof v !== 'number' || Number.isNaN(v)) {
        errors.push({ severity: 'error', message: `Part "${part.id}": ohms is not a valid number`, partId: part.id });
      }
    }
    if (part.params.farads !== undefined) {
      const v = /** @type {number} */ (part.params.farads);
      if (typeof v !== 'number' || v < 0 || Number.isNaN(v)) {
        errors.push({ severity: 'error', message: `Part "${part.id}": farads must be a non-negative number`, partId: part.id });
      }
    }
  }

  // ─── Net validation ─────────────────────────────────────────────────

  for (const net of nets) {
    if (netIds.has(net.id)) {
      errors.push({ severity: 'warning', message: `Duplicate net id "${net.id}"`, netId: net.id });
    }
    netIds.add(net.id);

    // Check that referenced parts exist
    for (const t of net.terminals) {
      if (!partIds.has(t.part)) {
        errors.push({
          severity: 'error',
          message: `Net "${net.id}" references unknown part "${t.part}"`,
          netId: net.id,
        });
      }
    }

    // Empty net
    if (net.terminals.length === 0) {
      errors.push({ severity: 'warning', message: `Net "${net.id}" has no terminals`, netId: net.id });
    }
  }

  // ─── Structural checks ─────────────────────────────────────────────

  // Check for GND reference — required when VCC is present
  const hasGnd = parts.some(p => p.kind === 'gnd');
  const hasVcc = parts.some(p => p.kind === 'vcc');
  const hasMcu = parts.some(p => p.kind === 'mcu');
  if (hasVcc && !hasGnd && !hasMcu) {
    // VCC without GND and no MCU to provide ground → error
    errors.push({
      severity: 'error',
      message: 'Netlist has VCC but no GND part and no MCU. A ground reference is required.',
    });
  } else if (hasVcc && !hasGnd) {
    // VCC without GND but MCU present → warning (MCU pin can be ground)
    errors.push({
      severity: 'warning',
      message: 'Netlist has VCC but no GND part. The MCU pin provides a ground path, but an explicit GND is recommended.',
    });
  }

  // Unconnected parts (no net references them)
  const connectedParts = new Set();
  for (const net of nets) {
    for (const t of net.terminals) {
      connectedParts.add(t.part);
    }
  }
  for (const part of parts) {
    if (!connectedParts.has(part.id)) {
      errors.push({
        severity: 'warning',
        message: `Part "${part.id}" (${part.kind}) is not connected to any net`,
        partId: part.id,
      });
    }
  }

  return errors;
}

/**
 * Throw if the netlist has any errors (not warnings).
 * @param {Part[]} parts
 * @param {Net[]} nets
 */
export function assertValidNetlist(parts, nets) {
  const errors = validateNetlist(parts, nets);
  const fatal = errors.filter(e => e.severity === 'error');
  if (fatal.length > 0) {
    throw new Error('Invalid netlist:\n' + fatal.map(e => `  - ${e.message}`).join('\n'));
  }
}
