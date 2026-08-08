/**
 * bw-board — the board layer between an emulated MCU and a circuit designer.
 *
 * Netlist, component models, pin resolution, instruments, and transducers.
 * No runtime dependencies. Runs in a browser or Node.
 *
 * @module bw-board
 */

export { BoardImpl } from './board.js';
export { pinThevenin, R_STRONG, R_QUASI_PULLUP } from './pin-model.js';
export { solveMNA } from './mna.js';
export { inferNetlist, checkWiring } from './infer-netlist.js';
export { runTrace } from './scripted-mcu.js';
export { runConformance, formatReport } from './conformance.js';
export { createEmu8051Adapter, formatPollingLossReport } from './emu8051-adapter.js';
export { validateNetlist, assertValidNetlist } from './validate.js';
export { NetlistBuilder } from './builder.js';
