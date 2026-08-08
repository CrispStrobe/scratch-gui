/**
 * Simulation driver — connects the UI to a real BoardImpl from bw-board.
 *
 * Every value returned by this module comes from the engine.
 * Nothing is fabricated.
 */

import { getEngine } from '../engine.js';

/**
 * Create a board, load a netlist, and return the board instance.
 *
 * @param {Array} parts
 * @param {Array} nets
 * @param {number} [vcc=5.0]
 * @returns {BoardImpl}
 */
export function createBoard(parts, nets, vcc = 5.0) {
  const { BoardImpl } = getEngine();
  const board = new BoardImpl(vcc);
  board.setNetlist(parts, nets);
  return board;
}

/**
 * Snapshot the board's instrument readings for the current time.
 * Every value comes from the engine — nothing is invented.
 *
 * @param {BoardImpl} board
 * @param {string} label — description of the current state
 * @param {number} tMs — timestamp in milliseconds
 * @returns {{ label, tMs, readings }}
 */
export function snapshot(board, label, tMs) {
  const readings = {};

  // LED brightness for each LED part
  for (const part of board.parts) {
    if (part.kind === 'led') {
      readings[`brightness(${part.id})`] = board.ledBrightness(part.id);
    }
    if (part.kind === 'buzzer') {
      readings[`buzzerTone(${part.id})`] = board.buzzerTone(part.id);
    }
  }

  // Node voltages for all nets
  for (const net of board.nets) {
    readings[`V(${net.id})`] = board.nodeVoltage(net.id);
  }

  return { label, tMs, readings };
}

/**
 * Run the active-low LED demo trace.
 *
 * Same scenario as bw-board's led-active-low test:
 * quasi-bidir pin driving low → LED bright, driving high → LED dark.
 *
 * @param {BoardImpl} board
 * @returns {Array<{label: string, tMs: number, readings: object}>}
 */
export function runDemoTrace(board) {
  const MS = 1_000_000n;
  const snapshots = [];

  // State 1: pin high (quasi) → LED off (both sides at VCC)
  board.setPin('P1.0', 'quasi', true);
  board.advanceTo(25n * MS);
  snapshots.push(snapshot(board, 'P1.0 quasi HIGH → LED off', 25));

  // State 2: pin low (quasi) → LED on (strong sink, ~2.9 mA)
  board.setPin('P1.0', 'quasi', false);
  board.advanceTo(50n * MS);
  snapshots.push(snapshot(board, 'P1.0 quasi LOW → LED on (~0.14)', 50));

  // State 3: pin high again → LED off
  board.setPin('P1.0', 'quasi', true);
  board.advanceTo(75n * MS);
  snapshots.push(snapshot(board, 'P1.0 quasi HIGH → LED off', 75));

  // State 4: push-pull low → LED on (same as quasi sink)
  board.setPin('P1.0', 'pushpull', false);
  board.advanceTo(100n * MS);
  snapshots.push(snapshot(board, 'P1.0 push-pull LOW → LED on', 100));

  return snapshots;
}
