/**
 * bw-circuit-ui — importable entry point.
 *
 * Usage:
 *   import { setEngine, CircuitDesigner } from 'bw-circuit-ui';
 *   import { BoardImpl } from './lib/bw-board/board.js';
 *   import { inferNetlist, checkWiring } from './lib/bw-board/infer-netlist.js';
 *
 *   setEngine({ BoardImpl, inferNetlist, checkWiring });
 *   <CircuitDesigner project={{ pins: [...] }} />
 *
 * The host decides where the engine comes from. This package never
 * imports bw-board by path.
 */

export { setEngine } from './engine.js';
export { CircuitDesigner } from './components/CircuitDesigner.jsx';
export { Circuit } from './model/circuit.js';
export { inferCircuit, checkWiring } from './model/inference.js';
export { createMeterState, readMeter } from './model/multimeter.js';
