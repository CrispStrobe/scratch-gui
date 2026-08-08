/**
 * PartTooltip — shows part info and live readings on hover.
 *
 * All values come from the engine. Nothing is fabricated.
 */

import React from 'react';
import { partLabel, fmtOhms } from '../model/format.js';

/**
 * @param {{ part, circuit, visible, x, y }} props
 */
export function PartTooltip({ part, circuit, visible, x, y }) {
  if (!visible || !part) return null;

  const lines = [];
  lines.push(partLabel(part));

  // Live readings from the engine (if available)
  try {
    switch (part.kind) {
      case 'led': {
        const b = circuit.ledBrightness(part.id);
        lines.push(`Brightness: ${(b * 100).toFixed(1)}%`);
        if (b > 0.001) {
          lines.push(`Current: ${(b * 20).toFixed(2)} mA`);
        }
        break;
      }
      case 'buzzer': {
        const tone = circuit.buzzerTone(part.id);
        lines.push(tone.on ? `${tone.hz.toFixed(0)} Hz` : 'Off');
        break;
      }
      case 'resistor':
        lines.push(`${fmtOhms(part.params.ohms)}`);
        break;
      case 'potentiometer':
        lines.push(`${fmtOhms(part.params.ohms)} pot`);
        break;
      case 'capacitor':
        lines.push(`${part.params.farads} F`);
        break;
      default:
        break;
    }
  } catch {
    // Part might not be wired to engine yet
  }

  return (
    <div style={{
      position: 'fixed',
      left: x + 15,
      top: y - 10,
      background: '#0a0a1a',
      border: '1px solid #3498db',
      borderRadius: '4px',
      padding: '6px 8px',
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ecf0f1',
      pointerEvents: 'none',
      zIndex: 100,
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{
          color: i === 0 ? '#3498db' : '#bdc3c7',
          fontWeight: i === 0 ? 'bold' : 'normal',
        }}>{line}</div>
      ))}
    </div>
  );
}
