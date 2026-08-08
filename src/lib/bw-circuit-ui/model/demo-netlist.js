/**
 * Hand-written netlist: the active-low LED circuit.
 *
 * This is the same circuit from bw-board's led-active-low.test.js:
 *   VCC (5V) → R1 (1kΩ) → LED1 (Vf=2V, red) → MCU pin P1.0
 *
 * It is the CORRECT wiring for a quasi-bidirectional 8051 pin:
 * writing 0 (strong sink) lights the LED; writing 1 (weak source) does not.
 *
 * Layout positions are in SVG user units. Parts are placed on a grid.
 */

/** @type {import('../../node_modules/@wokwi/elements/dist/esm/pin.d.ts').ElementPin[]} */

/**
 * Parts with layout positions for the static render.
 * `x` and `y` are SVG coordinates for the part's anchor point.
 */
export const demoParts = [
  {
    id: 'VCC', kind: 'vcc', params: {},
    terminals: ['vcc'],
    x: 200, y: 60,
  },
  {
    id: 'GND', kind: 'gnd', params: {},
    terminals: ['gnd'],
    x: 500, y: 340,
  },
  {
    id: 'R1', kind: 'resistor', params: { ohms: 1000 },
    terminals: ['a', 'b'],
    x: 200, y: 150,
  },
  {
    id: 'LED1', kind: 'led', params: { vf: 2.0, color: 'red' },
    terminals: ['anode', 'cathode'],
    x: 200, y: 260,
  },
  {
    id: 'MCU', kind: 'mcu', params: {},
    terminals: ['P1.0', 'P1.3', 'P1.5', 'P3.2'],
    x: 400, y: 200,
  },
];

/**
 * Nets connecting the parts.
 */
export const demoNets = [
  {
    id: 'net_vcc',
    terminals: [
      { part: 'VCC', terminal: 'vcc' },
      { part: 'R1', terminal: 'a' },
    ],
  },
  {
    id: 'net_r_led',
    terminals: [
      { part: 'R1', terminal: 'b' },
      { part: 'LED1', terminal: 'anode' },
    ],
  },
  {
    id: 'net_led_pin',
    terminals: [
      { part: 'LED1', terminal: 'cathode' },
      { part: 'MCU', terminal: 'P1.0' },
    ],
  },
];

/**
 * Terminal positions relative to each part's anchor.
 * These define where wires connect visually.
 */
export const terminalOffsets = {
  VCC:  { vcc: { dx: 0, dy: 20 } },
  GND:  { gnd: { dx: 0, dy: -10 } },
  R1:   { a: { dx: -30, dy: 0 }, b: { dx: 30, dy: 0 } },
  LED1: { anode: { dx: 0, dy: -15 }, cathode: { dx: 0, dy: 15 } },
  MCU:  {
    'P1.0': { dx: -60, dy: -40 },
    'P1.3': { dx: -60, dy: -10 },
    'P1.5': { dx: -60, dy: 20 },
    'P3.2': { dx: -60, dy: 50 },
  },
};
