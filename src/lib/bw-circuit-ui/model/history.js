/**
 * Undo/redo history for the circuit model.
 *
 * Stores snapshots of { parts, wires } after each mutation.
 * The circuit model calls save() after every change; the UI
 * calls undo()/redo() to navigate.
 *
 * Snapshots are plain JSON — no engine state (it gets rebuilt
 * from the netlist via _syncNetlist).
 */

const MAX_HISTORY = 50;

export class History {
  constructor() {
    /** @type {string[]} — JSON-serialized snapshots */
    this._stack = [];
    /** @type {number} — current position in the stack */
    this._cursor = -1;
  }

  /**
   * Save a snapshot. Truncates any redo states.
   * @param {{ parts: Array, wires: Array }} state
   */
  save(state) {
    const json = JSON.stringify({ parts: state.parts, wires: state.wires });

    // Don't save if identical to current (e.g. movePart to same position)
    if (this._cursor >= 0 && this._stack[this._cursor] === json) return;

    // Truncate redo states
    this._stack.length = this._cursor + 1;
    this._stack.push(json);

    // Cap size
    if (this._stack.length > MAX_HISTORY) {
      this._stack.shift();
    }
    this._cursor = this._stack.length - 1;
  }

  /**
   * @returns {{ parts, wires } | null}
   */
  undo() {
    if (this._cursor <= 0) return null;
    this._cursor--;
    return JSON.parse(this._stack[this._cursor]);
  }

  /**
   * @returns {{ parts, wires } | null}
   */
  redo() {
    if (this._cursor >= this._stack.length - 1) return null;
    this._cursor++;
    return JSON.parse(this._stack[this._cursor]);
  }

  /** @returns {boolean} */
  get canUndo() { return this._cursor > 0; }

  /** @returns {boolean} */
  get canRedo() { return this._cursor < this._stack.length - 1; }

  /** @returns {number} */
  get length() { return this._stack.length; }
}
