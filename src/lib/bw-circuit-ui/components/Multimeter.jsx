/**
 * Multimeter component — V / A / Ω with the power-off rule.
 *
 * The honesty rule: resistance on a powered board shows
 * "Turn power OFF to measure resistance" — this is the meter
 * behaving correctly, not an error.
 *
 * Every value comes from the engine. Nothing is fabricated.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { createMeterState, readMeter } from '../model/multimeter.js';

/**
 * @param {{ circuit, wires, parts, placingProbe, onStartPlacing, onStopPlacing }} props
 * - placingProbe: 'A'|'B'|null (from parent)
 * - onStartPlacing(which): tell parent we want to place a probe
 * - onStopPlacing(): tell parent we're done
 */
export function Multimeter({ circuit, wires, parts, placingProbe, onStartPlacing, onStopPlacing, probePlacement }) {
  const [meter, setMeter] = useState(createMeterState);

  const setMode = useCallback((mode) => {
    setMeter(m => ({ ...m, mode }));
  }, []);

  // When parent delivers a probe placement
  useEffect(() => {
    if (!probePlacement || !placingProbe) return;
    const { netId, partId, terminal } = probePlacement;
    const probe = { netId, partId, terminal };
    setMeter(m => ({
      ...m,
      [placingProbe === 'A' ? 'probeA' : 'probeB']: probe,
    }));
    onStopPlacing();
  }, [probePlacement, placingProbe, onStopPlacing]);

  const reading = readMeter(meter, circuit);

  const modeButtons = [
    { mode: 'voltage', label: 'V', color: '#3498db' },
    { mode: 'current', label: 'A', color: '#e74c3c' },
    { mode: 'resistance', label: 'Ω', color: '#2ecc71' },
  ];

  return (
    <div style={{
      background: '#1a1a2e',
      border: '1px solid #2c3e50',
      borderRadius: '8px',
      padding: '12px',
      width: '180px',
      fontFamily: 'monospace',
    }}>
      <h3 style={{ color: '#ecf0f1', fontSize: '13px', marginBottom: '10px' }}>
        Multimeter
      </h3>

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        {modeButtons.map(({ mode, label, color }) => (
          <button
            key={mode}
            onClick={() => setMode(mode)}
            style={{
              flex: 1, padding: '6px',
              background: meter.mode === mode ? '#2c3e50' : '#16213e',
              border: `1px solid ${meter.mode === mode ? color : '#2c3e50'}`,
              color: meter.mode === mode ? color : '#7f8c8d',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >{label}</button>
        ))}
      </div>

      {/* Display */}
      <div style={{
        background: '#0a0a1a',
        border: '1px solid #2c3e50',
        borderRadius: '4px',
        padding: '12px',
        textAlign: 'center',
        marginBottom: '10px',
      }}>
        <div style={{
          color: reading.value === '---' ? '#7f8c8d' : '#2ecc71',
          fontSize: '24px',
          fontWeight: 'bold',
          fontFamily: 'monospace',
        }}>
          {reading.value}
        </div>
        <div style={{ color: '#7f8c8d', fontSize: '14px' }}>
          {reading.unit}
        </div>
      </div>

      {/* Note (teaching feedback, not error) */}
      {reading.note && (
        <div style={{
          padding: '8px',
          background: reading.note.includes('Turn power OFF') ? '#1a1a0e' : '#16213e',
          border: `1px solid ${reading.note.includes('Turn power OFF') ? '#f39c12' : '#2c3e50'}`,
          borderRadius: '4px',
          marginBottom: '10px',
        }}>
          <div style={{
            color: reading.note.includes('Turn power OFF') ? '#f39c12' : '#7f8c8d',
            fontSize: '10px',
            lineHeight: '1.4',
          }}>
            {reading.note}
          </div>
        </div>
      )}

      {/* Probe placement */}
      <div style={{ marginBottom: '6px' }}>
        <div style={{ color: '#bdc3c7', fontSize: '10px', marginBottom: '4px' }}>
          Probes:
        </div>
        {['A', 'B'].map(which => {
          const probe = which === 'A' ? meter.probeA : meter.probeB;
          const isPlacing = placingProbe === which;
          const hasPlacement = probe.netId || probe.partId;
          return (
            <button
              key={which}
              onClick={() => isPlacing ? onStopPlacing() : onStartPlacing(which)}
              style={{
                display: 'block',
                width: '100%',
                padding: '4px 6px',
                marginBottom: '3px',
                background: isPlacing ? '#2c3e50' : '#16213e',
                border: isPlacing ? '1px solid #f39c12' : '1px solid #2c3e50',
                borderRadius: '4px',
                color: isPlacing ? '#f39c12' : hasPlacement ? '#2ecc71' : '#7f8c8d',
                fontFamily: 'monospace',
                fontSize: '10px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Probe {which}:{' '}
              {isPlacing
                ? 'click a terminal...'
                : hasPlacement
                  ? (probe.netId || `${probe.partId}:${probe.terminal}`)
                  : 'not placed'}
            </button>
          );
        })}
      </div>

      <div style={{ color: '#7f8c8d', fontSize: '9px', lineHeight: '1.3' }}>
        All readings from engine.
      </div>
    </div>
  );
}
