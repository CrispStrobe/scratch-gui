/**
 * Formatting utilities for part labels and values.
 */

/**
 * Format a resistance value with SI prefix.
 * @param {number} ohms
 * @returns {string}
 */
export function fmtOhms(ohms) {
  if (ohms >= 1e6) return (ohms / 1e6).toFixed(ohms % 1e6 === 0 ? 0 : 1) + 'MΩ';
  if (ohms >= 1e3) return (ohms / 1e3).toFixed(ohms % 1e3 === 0 ? 0 : 1) + 'kΩ';
  return ohms + 'Ω';
}

/**
 * Format a capacitance value with SI prefix.
 * @param {number} farads
 * @returns {string}
 */
export function fmtFarads(farads) {
  if (farads >= 1e-3) return (farads * 1e3).toFixed(1) + 'mF';
  if (farads >= 1e-6) return (farads * 1e6).toFixed(0) + 'µF';
  if (farads >= 1e-9) return (farads * 1e9).toFixed(0) + 'nF';
  return (farads * 1e12).toFixed(0) + 'pF';
}

/**
 * Format a short label for a part.
 * @param {object} part — { id, kind, params }
 * @returns {string}
 */
export function partLabel(part) {
  // Extract a short name: "resistor_3" → "R3", "led_1" → "LED1"
  const num = part.id.replace(/\D+/g, '');
  switch (part.kind) {
    case 'resistor': return `R${num} ${fmtOhms(part.params.ohms || 0)}`;
    case 'led': return `LED${num}`;
    case 'capacitor': return `C${num} ${fmtFarads(part.params.farads || 0)}`;
    case 'potentiometer': return `POT${num} ${fmtOhms(part.params.ohms || 0)}`;
    case 'buzzer': return `BZ${num}`;
    case 'button': return `BTN${num}`;
    case 'diode': return `D${num}`;
    default: return part.id;
  }
}
