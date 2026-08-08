/**
 * Engine injection point.
 *
 * The UI never reaches into bw-board by path. Instead, the host calls
 * setEngine() before rendering CircuitDesigner, providing { BoardImpl,
 * inferNetlist, checkWiring }. The Vite dev harness does this at boot
 * with the local copy; brickwright-lite does it with its vendored copy.
 *
 * Usage (host):
 *   import { setEngine } from 'bw-circuit-ui';
 *   import { BoardImpl } from './lib/bw-board/board.js';
 *   import { inferNetlist, checkWiring } from './lib/bw-board/infer-netlist.js';
 *   setEngine({ BoardImpl, inferNetlist, checkWiring });
 *
 * Usage (consumer inside this package):
 *   import { getEngine } from '../engine.js';
 *   const { BoardImpl } = getEngine();
 */

/** @type {{ BoardImpl: any, inferNetlist: any, checkWiring: any } | null} */
let _engine = null;

/**
 * Inject the engine. Must be called before CircuitDesigner mounts.
 *
 * @param {{ BoardImpl: Function, inferNetlist: Function, checkWiring: Function }} engine
 */
export function setEngine(engine) {
  if (!engine.BoardImpl) throw new Error('setEngine: BoardImpl is required');
  if (!engine.inferNetlist) throw new Error('setEngine: inferNetlist is required');
  if (!engine.checkWiring) throw new Error('setEngine: checkWiring is required');
  _engine = engine;
}

/**
 * Get the injected engine. Throws if not yet set.
 *
 * @returns {{ BoardImpl: Function, inferNetlist: Function, checkWiring: Function }}
 */
export function getEngine() {
  if (!_engine) {
    throw new Error(
      'bw-circuit-ui: engine not injected. Call setEngine({ BoardImpl, inferNetlist, checkWiring }) before using CircuitDesigner.'
    );
  }
  return _engine;
}
