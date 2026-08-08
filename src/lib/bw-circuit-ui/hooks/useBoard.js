/**
 * useBoard — React hook that subscribes to a BoardImpl's onChange.
 *
 * Returns the render state from getRenderState() and re-renders
 * whenever the board fires a change event. Replaces the revision
 * counter approach with a proper subscription.
 *
 * Works with both internal boards (created by Circuit) and external
 * boards (provided by the host for live emulator integration).
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * @param {object} board — a BoardImpl instance
 * @returns {{ renderState: object|null, refresh: () => void }}
 */
export function useBoard(board) {
  const [renderState, setRenderState] = useState(null);

  const refresh = useCallback(() => {
    if (!board || !board.getRenderState) return;
    try {
      setRenderState(board.getRenderState());
    } catch {
      // Board might not have a valid netlist yet
    }
  }, [board]);

  useEffect(() => {
    if (!board) return;

    // Initial render state
    refresh();

    // Subscribe to changes if the board supports it
    if (board.onChange) {
      const handler = () => refresh();
      board.onChange(handler);
      return () => {
        if (board.offChange) board.offChange(handler);
      };
    }
  }, [board, refresh]);

  return { renderState, refresh };
}
