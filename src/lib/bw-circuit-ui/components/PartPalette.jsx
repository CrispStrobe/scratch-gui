/**
 * PartPalette — a sidebar of parts that can be added to the circuit.
 *
 * Click a part type to add it at a default position on the canvas.
 * (Drag-from-palette is a Phase 3 enhancement; click-to-add first.)
 */

import React from 'react';

const PART_TYPES = [
  { kind: 'vcc', label: 'VCC', params: {}, color: '#e74c3c' },
  { kind: 'gnd', label: 'GND', params: {}, color: '#3498db' },
  { kind: 'resistor', label: 'Resistor', params: { ohms: 1000 }, color: '#e67e22' },
  { kind: 'led', label: 'LED', params: { vf: 2.0, color: 'red' }, color: '#2ecc71' },
  { kind: 'potentiometer', label: 'Pot', params: { ohms: 10000 }, color: '#9b59b6' },
  { kind: 'button', label: 'Button', params: {}, color: '#f39c12' },
  { kind: 'buzzer', label: 'Buzzer', params: {}, color: '#1abc9c' },
  { kind: 'capacitor', label: 'Cap', params: { farads: 0.0001 }, color: '#34495e' },
  { kind: 'mcu', label: 'MCU', params: { pins: ['P1.0', 'P1.3', 'P1.5', 'P3.2'] }, color: '#7f8c8d' },
];

export function PartPalette({ onAddPart }) {
  return (
    <div style={{
      background: '#1a1a2e',
      border: '1px solid #2c3e50',
      borderRadius: '8px',
      padding: '12px',
      width: '140px',
      fontFamily: 'monospace',
    }}>
      <h3 style={{ color: '#ecf0f1', fontSize: '13px', marginBottom: '10px' }}>
        Parts
      </h3>
      {PART_TYPES.map(({ kind, label, params, color }) => (
        <button
          key={kind}
          onClick={() => onAddPart(kind, params)}
          style={{
            display: 'block',
            width: '100%',
            padding: '8px 6px',
            marginBottom: '4px',
            background: '#16213e',
            border: `1px solid ${color}`,
            borderRadius: '4px',
            color,
            fontFamily: 'monospace',
            fontSize: '11px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          + {label}
        </button>
      ))}
    </div>
  );
}
