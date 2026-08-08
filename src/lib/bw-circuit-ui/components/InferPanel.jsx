/**
 * InferPanel — load a circuit from pin declarations (boundary C).
 *
 * The active-low vs active-high comparison is the core lesson:
 * same LED, same pin, but one is 14.5% bright and the other is <1%.
 * That single comparison justifies the whole simulator.
 */

import React, { useState, useCallback } from 'react';
import { inferCircuit, checkWiring } from '../model/inference.js';

const COMPARISON_PRESETS = [
  {
    name: 'Correct (active-low)',
    desc: 'VCC → R → LED → pin',
    pins: [
      { name: 'led1', port: 1, bit: 0, direction: 'output', activeLow: true },
    ],
    highlight: true,
  },
  {
    name: 'Naive (active-high)',
    desc: 'pin → R → LED → GND',
    pins: [
      { name: 'led1', port: 1, bit: 0, direction: 'output', activeLow: false },
    ],
    highlight: true,
  },
];

const OTHER_PRESETS = [
  {
    name: 'LED + pot + button',
    pins: [
      { name: 'led1', port: 1, bit: 0, direction: 'output', activeLow: true },
      { name: 'pot', port: 1, bit: 3, direction: 'analog', activeLow: false },
      { name: 'button', port: 3, bit: 2, direction: 'input', activeLow: false },
    ],
  },
  {
    name: 'Two LEDs (active-low)',
    pins: [
      { name: 'led1', port: 1, bit: 0, direction: 'output', activeLow: true },
      { name: 'led2', port: 1, bit: 1, direction: 'output', activeLow: true },
    ],
  },
];

export function InferPanel({ onLoadCircuit }) {
  const [notes, setNotes] = useState([]);
  const [lastLoaded, setLastLoaded] = useState(null);

  const handleLoad = useCallback((preset) => {
    const stc = {
      device: 'STC12C5A60S2',
      clock: 11059200,
      pins: preset.pins,
    };
    const result = inferCircuit(stc);
    onLoadCircuit(result.parts, result.nets);
    setNotes(result.notes);
    setLastLoaded(preset.name);
  }, [onLoadCircuit]);

  return (
    <div style={{
      background: '#1a1a2e',
      border: '1px solid #2c3e50',
      borderRadius: '8px',
      padding: '12px',
      width: '180px',
      fontFamily: 'monospace',
      fontSize: '11px',
    }}>
      <h3 style={{ color: '#ecf0f1', fontSize: '13px', marginBottom: '6px' }}>
        Why active-low?
      </h3>
      <p style={{ color: '#f39c12', fontSize: '9px', marginBottom: '10px', lineHeight: '1.4' }}>
        Load each, hit Sim, compare the LED. Same pin, same LED — one
        is bright, one is barely visible. The simulator shows why.
      </p>

      {/* The comparison pair — visually grouped */}
      <div style={{
        border: '1px solid #f39c12',
        borderRadius: '4px',
        padding: '4px',
        marginBottom: '10px',
      }}>
        {COMPARISON_PRESETS.map(preset => (
          <button
            key={preset.name}
            onClick={() => handleLoad(preset)}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px',
              marginBottom: '2px',
              background: lastLoaded === preset.name ? '#2c3e50' : '#16213e',
              border: lastLoaded === preset.name ? '1px solid #f39c12' : '1px solid #2c3e50',
              borderRadius: '4px',
              color: lastLoaded === preset.name ? '#f39c12' : '#e67e22',
              fontFamily: 'monospace',
              fontSize: '10px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {preset.name}
            <div style={{ color: '#7f8c8d', fontSize: '9px' }}>{preset.desc}</div>
          </button>
        ))}
      </div>

      {/* Other presets */}
      <div style={{ color: '#7f8c8d', fontSize: '9px', marginBottom: '4px' }}>
        More circuits:
      </div>
      {OTHER_PRESETS.map(preset => (
        <button
          key={preset.name}
          onClick={() => handleLoad(preset)}
          style={{
            display: 'block',
            width: '100%',
            padding: '6px',
            marginBottom: '4px',
            background: lastLoaded === preset.name ? '#2c3e50' : '#16213e',
            border: '1px solid #2c3e50',
            borderRadius: '4px',
            color: lastLoaded === preset.name ? '#2ecc71' : '#bdc3c7',
            fontFamily: 'monospace',
            fontSize: '10px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {preset.name}
        </button>
      ))}

      {/* Teaching notes */}
      {notes.length > 0 && (
        <div style={{
          marginTop: '10px',
          padding: '8px',
          background: '#1a1a0e',
          border: '1px solid #f39c12',
          borderRadius: '4px',
        }}>
          <div style={{ color: '#f39c12', fontSize: '10px', marginBottom: '4px', fontWeight: 'bold' }}>
            Notes:
          </div>
          {notes.map((note, i) => (
            <div key={i} style={{ color: '#e67e22', fontSize: '10px', marginBottom: '2px' }}>
              {note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
