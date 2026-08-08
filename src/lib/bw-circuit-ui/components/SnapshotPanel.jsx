/**
 * SnapshotPanel — shows simulation trace snapshots and their readings.
 *
 * Every value displayed comes from the engine. Labels are descriptive
 * of the pin state; readings are the engine's instrument outputs.
 */

import React from 'react';

export function SnapshotPanel({ snapshots, activeIndex, onSelect }) {
  return (
    <div style={{
      background: '#1a1a2e',
      border: '1px solid #2c3e50',
      borderRadius: '8px',
      padding: '16px',
      width: '340px',
      fontFamily: 'monospace',
      fontSize: '12px',
    }}>
      <h3 style={{ color: '#ecf0f1', marginBottom: '12px' }}>
        Simulation Trace
      </h3>
      <p style={{ color: '#7f8c8d', marginBottom: '12px', fontSize: '10px' }}>
        All values from bw-board engine — nothing fabricated
      </p>

      {snapshots.map((snap, i) => (
        <div
          key={i}
          onClick={() => onSelect(i)}
          style={{
            padding: '10px',
            marginBottom: '8px',
            background: i === activeIndex ? '#2c3e50' : '#16213e',
            border: i === activeIndex ? '1px solid #3498db' : '1px solid #2c3e50',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <div style={{ color: '#ecf0f1', marginBottom: '6px', fontWeight: 'bold' }}>
            t={snap.tMs}ms — {snap.label}
          </div>
          {Object.entries(snap.readings).map(([key, val]) => (
            <div key={key} style={{ color: '#bdc3c7', fontSize: '11px' }}>
              <span style={{ color: '#7f8c8d' }}>{key}:</span>{' '}
              <span style={{
                color: key.startsWith('brightness') && val > 0.05 ? '#2ecc71' : '#bdc3c7',
              }}>
                {typeof val === 'number' ? val.toFixed(4) : JSON.stringify(val)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
