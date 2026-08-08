/**
 * Scripted MCU — a test harness that replays timestamped pin events
 * and asserts read-backs against hand-computed expected values.
 *
 * @module
 */

/**
 * @typedef {object} ScriptedEvent
 * @property {bigint} t - timestamp in nanoseconds
 * @property {[string, import('./types.js').PinMode, boolean]} [setPin]
 *   [pinId, mode, driveHigh]
 * @property {{ readPin?: [string, 0 | 1],
 *              readAnalog?: [string, number, number],
 *              ledBrightness?: [string, number, number],
 *              buzzerTone?: [string, number, number],
 *              nodeVoltage?: [string, number, number] }} [expect]
 *   Assertions: [target, expected, tolerance]
 */

import { BoardImpl } from './board.js';

/**
 * Run a scripted MCU trace against a board.
 *
 * @param {BoardImpl} board
 * @param {ScriptedEvent[]} trace
 * @returns {Array<{event: ScriptedEvent, field: string, expected: any, actual: any}>}
 *   List of failures (empty = all passed).
 */
export function runTrace(board, trace) {
  /** @type {Array<{event: ScriptedEvent, field: string, expected: any, actual: any}>} */
  const failures = [];

  for (const event of trace) {
    // Advance time
    board.advanceTo(event.t);

    // Apply pin change
    if (event.setPin) {
      const [pin, mode, driveHigh] = event.setPin;
      board.setPin(pin, mode, driveHigh);
    }

    // Check assertions
    if (event.expect) {
      const { readPin, readAnalog, ledBrightness, buzzerTone, nodeVoltage } = event.expect;

      if (readPin) {
        const [pin, expected] = readPin;
        const actual = board.readPin(pin);
        if (actual !== expected) {
          failures.push({ event, field: `readPin(${pin})`, expected, actual });
        }
      }

      if (readAnalog) {
        const [pin, expected, tol] = readAnalog;
        const actual = board.readAnalog(pin);
        if (Math.abs(actual - expected) > tol) {
          failures.push({ event, field: `readAnalog(${pin})`, expected, actual });
        }
      }

      if (ledBrightness) {
        const [partId, expected, tol] = ledBrightness;
        const actual = board.ledBrightness(partId);
        if (Math.abs(actual - expected) > tol) {
          failures.push({ event, field: `ledBrightness(${partId})`, expected, actual });
        }
      }

      if (buzzerTone) {
        const [partId, expectedHz, tolHz] = buzzerTone;
        const actual = board.buzzerTone(partId);
        if (Math.abs(actual.hz - expectedHz) > tolHz) {
          failures.push({ event, field: `buzzerTone(${partId})`, expected: expectedHz, actual: actual.hz });
        }
      }

      if (nodeVoltage) {
        const [netId, expected, tol] = nodeVoltage;
        const actual = board.nodeVoltage(netId);
        if (Math.abs(actual - expected) > tol) {
          failures.push({ event, field: `nodeVoltage(${netId})`, expected, actual });
        }
      }
    }
  }

  return failures;
}
