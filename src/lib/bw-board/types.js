/**
 * bw-board type definitions — boundary A (MCU ⇄ board) and boundary B (board ⇄ UI).
 *
 * These are the contract. See /simulation-contract.md for the reasoning.
 * No implementation here — just the shapes that both sides must agree on.
 *
 * @module
 */

// ─── Boundary A — the pin bus (MCU ⇄ board) ────────────────────────────────

/**
 * Pin identifier, e.g. "P1.0", "P3.2".
 * @typedef {string} PinId
 */

/**
 * The four STC12 port modes. Each is a different Thévenin equivalent.
 *   quasi       — strong pull-down, weak pull-up (~230 µA). Reset default.
 *   pushpull    — strong both ways.
 *   input       — high impedance, drives nothing.
 *   opendrain   — strong pull-down, no pull-up at all.
 *
 * @typedef {'quasi' | 'pushpull' | 'input' | 'opendrain'} PinMode
 */

/**
 * What the MCU tells the board.
 *
 * @typedef {object} McuToBoard
 * @property {(pin: PinId, mode: PinMode, driveHigh: boolean) => void} setPin
 *   The MCU changed what it does to a pin: its mode, its driven level, or both.
 *   A write to PxM0/PxM1 is a pin event, not just a write to Px.
 * @property {(tNs: bigint) => void} advanceTo
 *   Time has passed. Nanoseconds since reset; the board integrates RC/audio up to here.
 */

/**
 * What the board answers.
 *
 * @typedef {object} BoardToMcu
 * @property {(pin: PinId) => (0 | 1)} readPin
 *   The resolved logic level the MCU would read back on that pin.
 * @property {(pin: PinId) => number} readAnalog
 *   The ADC input as a voltage, 0…VCC. The MCU scales it to counts itself.
 */

// ─── Thévenin model ─────────────────────────────────────────────────────────

/**
 * A Thévenin equivalent source: open-circuit voltage and series resistance.
 * 'high-z' means the source is disconnected (input-only mode, or open-drain driving 1).
 *
 * @typedef {{ vTh: number; rTh: number } | 'high-z'} TheveninSource
 */

// ─── Boundary B — parts, probes and transducers (board ⇄ UI) ───────────────

/**
 * @typedef {'vcc' | 'gnd' | 'resistor' | 'capacitor' | 'diode' | 'led'
 *   | 'potentiometer' | 'button' | 'switch' | 'buzzer' | 'mcu'
 *   | 'npn' | 'pnp' | 'ldr' | 'ntc' | 'inductor' | 'zener'
 *   | 'seven_segment' | 'rgb_led'} PartKind
 */

/**
 * A component on the board.
 *
 * @typedef {object} Part
 * @property {string} id
 * @property {PartKind} kind
 * @property {Record<string, number | string>} params
 *   Kind-specific parameters: {ohms} for resistor, {farads} for capacitor,
 *   {vf, color} for LED, {ohms} for potentiometer, etc.
 * @property {string[]} terminals
 *   Terminal names: "a", "b", "wiper", or a PinId for the MCU part.
 */

/**
 * A net connecting terminals of parts.
 *
 * @typedef {object} Net
 * @property {string} id
 * @property {Array<{part: string, terminal: string}>} terminals
 */

/**
 * The board — boundary B interface.
 *
 * @typedef {object} Board
 * @property {(parts: Part[], nets: Net[]) => void} setNetlist
 *
 * @property {(net: string) => number} nodeVoltage
 *   Volts at the named net.
 *
 * @property {(part: string, terminal: string) => number} branchCurrent
 *   Amperes into the named terminal. Requires the MNA solver (phase 6).
 *
 * @property {(a: string, b: string) => number | 'requires-power-off'} resistance
 *   Resistance between two nets. Returns the reason, NOT a number, when the
 *   board is powered. A real DMM measures resistance with the power OFF.
 *
 * @property {(part: string) => number} ledBrightness
 *   0…1, current × PWM duty integrated over ~20 ms.
 *
 * @property {(part: string) => {hz: number, on: boolean}} buzzerTone
 *   Frequency derived from toggle period. The UI feeds this to Web Audio.
 *
 * @property {(part: string, value: number) => void} setControl
 *   User interaction: pot position 0…1, button 0/1, switch position.
 *
 * @property {(on: boolean) => void} setPower
 */

// ─── Exports (for documentation; this module defines only types) ────────────

export {};
