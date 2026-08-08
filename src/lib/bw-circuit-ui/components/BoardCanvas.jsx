/**
 * BoardCanvas — renders parts and wires on a canvas with interaction.
 *
 * Phase 3: interactive. Drag parts, click terminals to wire, delete,
 * turn potentiometer, press buttons.
 *
 * LED brightness and node voltages come from the engine — never fabricated.
 *
 * Architecture: SVG layer for wires and simple symbols,
 * wokwi web components positioned absolutely on top via CSS.
 */

import React, { useState, useCallback } from 'react';
import { WokwiLed, WokwiResistor, WokwiBuzzer, WokwiPushbutton, WokwiPotentiometer } from '../wokwi-wrappers/index.js';
import { partLabel } from '../model/format.js';
import { routeWire, partBBoxes } from '../model/wire-router.js';
import { PartTooltip } from './PartTooltip.jsx';

const CANVAS_W = 700;
const CANVAS_H = 500;

/**
 * Rotate a {dx, dy} offset by deg degrees (0, 90, 180, 270).
 */
function rotateOffset(dx, dy, deg) {
  switch (((deg % 360) + 360) % 360) {
    case 0: return { dx, dy };
    case 90: return { dx: -dy, dy: dx };
    case 180: return { dx: -dx, dy: -dy };
    case 270: return { dx: dy, dy: -dx };
    default: return { dx, dy };
  }
}

/**
 * Terminal offset defaults per part kind, rotated by part.rotation.
 * Returns {terminalName: {dx, dy}} relative to part anchor.
 */
function terminalOffsetsForPart(part) {
  const rot = part.rotation || 0;
  const r = (dx, dy) => rotateOffset(dx, dy, rot);

  switch (part.kind) {
    case 'vcc': return { vcc: r(0, 20) };
    case 'gnd': return { gnd: r(0, -10) };
    case 'resistor': return { a: r(-35, 0), b: r(35, 0) };
    case 'led': return { anode: r(-10, 0), cathode: r(10, 0) };
    case 'potentiometer': return { a: r(-25, 20), wiper: r(0, -20), b: r(25, 20) };
    case 'button': return { a: r(-15, 0), b: r(15, 0) };
    case 'buzzer': return { a: r(-15, 0), b: r(15, 0) };
    case 'capacitor': return { a: r(-15, 0), b: r(15, 0) };
    case 'mcu': {
      const offsets = {};
      const pinCount = part.terminals.length;
      const chipH = Math.max(60, pinCount * 30 + 20);
      const chipY = -chipH / 2;
      part.terminals.forEach((pin, i) => {
        offsets[pin] = r(-60, chipY + 30 + i * 30);
      });
      return offsets;
    }
    default: return { a: r(-15, 0), b: r(15, 0) };
  }
}

function terminalPos(part, terminal) {
  const offsets = terminalOffsetsForPart(part);
  const offset = offsets[terminal] ?? { dx: 0, dy: 0 };
  return { x: part.x + offset.dx, y: part.y + offset.dy };
}

function fmtV(v) {
  if (v == null || typeof v !== 'number') return '';
  return v.toFixed(3) + ' V';
}

// ── SVG part rendering ───────────────────────────────────────────

function SvgParts({ parts, selectedPart, onSelectPart }) {
  return parts.map(part => {
    const { id, kind, x, y } = part;
    const isSelected = selectedPart === id;
    const selStroke = isSelected ? '#f1c40f' : undefined;

    switch (kind) {
      case 'vcc':
        return (
          <g key={id} transform={`translate(${x}, ${y})`}
            onClick={(e) => { e.stopPropagation(); onSelectPart(id); }}
            style={{ cursor: 'pointer' }}>
            <line x1={0} y1={20} x2={0} y2={5} stroke={selStroke || '#e74c3c'} strokeWidth={2} />
            <line x1={-15} y1={5} x2={15} y2={5} stroke={selStroke || '#e74c3c'} strokeWidth={2} />
            <text x={0} y={-2} textAnchor="middle" fill={selStroke || '#e74c3c'} fontSize={12}
              fontFamily="monospace" fontWeight="bold">VCC</text>
          </g>
        );
      case 'gnd':
        return (
          <g key={id} transform={`translate(${x}, ${y})`}
            onClick={(e) => { e.stopPropagation(); onSelectPart(id); }}
            style={{ cursor: 'pointer' }}>
            <line x1={0} y1={-10} x2={0} y2={0} stroke={selStroke || '#3498db'} strokeWidth={2} />
            <line x1={-15} y1={0} x2={15} y2={0} stroke={selStroke || '#3498db'} strokeWidth={2} />
            <line x1={-10} y1={5} x2={10} y2={5} stroke={selStroke || '#3498db'} strokeWidth={2} />
            <line x1={-5} y1={10} x2={5} y2={10} stroke={selStroke || '#3498db'} strokeWidth={2} />
            <text x={0} y={24} textAnchor="middle" fill={selStroke || '#3498db'} fontSize={12}
              fontFamily="monospace" fontWeight="bold">GND</text>
          </g>
        );
      case 'mcu': {
        // Scale chip body to match pin count
        const pinCount = part.terminals.length;
        const chipH = Math.max(60, pinCount * 30 + 20);
        const chipY = -chipH / 2;
        return (
          <g key={id} transform={`translate(${x}, ${y})`}
            onClick={(e) => { e.stopPropagation(); onSelectPart(id); }}
            style={{ cursor: 'pointer' }}>
            <rect x={-50} y={chipY} width={120} height={chipH} rx={6}
              fill="#2c3e50" stroke={selStroke || '#7f8c8d'} strokeWidth={isSelected ? 3 : 2} />
            <text x={10} y={chipY + 18} textAnchor="middle" fill="#ecf0f1" fontSize={14}
              fontFamily="monospace" fontWeight="bold">STC12</text>
            {part.terminals.map((pin, i) => {
              const pinY = chipY + 30 + i * 30;
              return (
                <g key={pin}>
                  <circle cx={-50} cy={pinY} r={3} fill="#f39c12" />
                  <text x={-42} y={pinY + 4} fill="#f39c12" fontSize={10}
                    fontFamily="monospace">{pin}</text>
                </g>
              );
            })}
          </g>
        );
      }
      default:
        return null;
    }
  });
}

// ── Terminal dots (clickable for wiring) ─────────────────────────

function TerminalDots({ parts, wires, wiringFrom, onTerminalClick, placingProbe }) {
  // Build a set of connected terminals for fast lookup
  const connected = new Set();
  for (const w of wires) {
    connected.add(`${w.from.part}:${w.from.terminal}`);
    connected.add(`${w.to.part}:${w.to.terminal}`);
  }

  const dots = [];
  for (const part of parts) {
    for (const term of part.terminals) {
      const pos = terminalPos(part, term);
      const isWiringSource = wiringFrom &&
        wiringFrom.part === part.id && wiringFrom.terminal === term;
      const isConnected = connected.has(`${part.id}:${term}`);

      // Colors: wiring source = gold, placing probe = purple,
      // connected = green (filled), unconnected = red (hollow)
      let fill, stroke, r;
      if (isWiringSource) {
        fill = '#f1c40f'; stroke = '#f39c12'; r = 6;
      } else if (placingProbe) {
        fill = '#9b59b6'; stroke = '#8e44ad'; r = 5;
      } else if (isConnected) {
        fill = '#2ecc71'; stroke = '#27ae60'; r = 4;
      } else {
        fill = 'none'; stroke = '#e74c3c'; r = 4;
      }

      dots.push(
        <g key={`${part.id}:${term}`}>
          <circle
            cx={pos.x} cy={pos.y} r={r}
            fill={fill} stroke={stroke} strokeWidth={1.5}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onTerminalClick(part.id, term);
            }}
          />
          {/* Terminal name tooltip — show on hover for unconnected terminals */}
          {!isConnected && (
            <text
              x={pos.x} y={pos.y - 8}
              textAnchor="middle" fill="#e74c3c" fontSize={8}
              fontFamily="monospace" style={{ pointerEvents: 'none' }}
            >{term}</text>
          )}
        </g>
      );
    }
  }
  return <>{dots}</>;
}

// ── Wires ────────────────────────────────────────────────────────

function Wires({ wires, parts, selectedWire, onSelectWire, hoveredNet, onHoverNet, nodeVoltages }) {
  // Group wires by net to find all terminals in each net
  const netTerminals = new Map();
  for (const w of wires) {
    if (!netTerminals.has(w.netId)) netTerminals.set(w.netId, new Set());
    const set = netTerminals.get(w.netId);
    set.add(`${w.from.part}:${w.from.terminal}`);
    set.add(`${w.to.part}:${w.to.terminal}`);
  }

  return wires.map(wire => {
    const fromPart = parts.find(p => p.id === wire.from.part);
    const toPart = parts.find(p => p.id === wire.to.part);
    if (!fromPart || !toPart) return null;

    const a = terminalPos(fromPart, wire.from.terminal);
    const b = terminalPos(toPart, wire.to.terminal);
    const obstacles = partBBoxes(parts, wire.from.part, wire.to.part);
    const pathD = routeWire(a, b, obstacles);
    const isSelected = selectedWire === wire.id;
    const isHovered = hoveredNet && hoveredNet === wire.netId;
    const wireColor = isSelected ? '#f1c40f' : isHovered ? '#3498db' : '#2ecc71';
    const wireWidth = isSelected ? 3 : isHovered ? 2.5 : 2;

    return (
      <g key={wire.id}>
        {/* Invisible wider hit area */}
        <path
          d={pathD}
          stroke="transparent"
          strokeWidth={10}
          fill="none"
          style={{ cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); onSelectWire(wire.id); }}
          onMouseEnter={() => onHoverNet(wire.netId)}
          onMouseLeave={() => onHoverNet(null)}
        />
        <path
          d={pathD}
          stroke={wireColor}
          strokeWidth={wireWidth}
          fill="none"
          strokeLinejoin="round"
        />
        {/* Current flow arrow at wire midpoint */}
        {nodeVoltages && (() => {
          // Find the net voltages for both endpoints' nets
          const fromNet = wire.netId;
          const v = nodeVoltages[fromNet];
          if (v == null || Math.abs(v) < 0.001) return null;

          // Draw a small arrow at the midpoint of the wire
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 40) return null; // too short for an arrow

          const nx = dx / len;
          const ny = dy / len;
          const sz = 5;

          return (
            <polygon
              points={`${mx + nx * sz},${my + ny * sz} ${mx - nx * sz - ny * sz * 0.6},${my - ny * sz + nx * sz * 0.6} ${mx - nx * sz + ny * sz * 0.6},${my - ny * sz - nx * sz * 0.6}`}
              fill={wireColor}
              opacity={0.6}
              style={{ pointerEvents: 'none' }}
            />
          );
        })()}
      </g>
    );
  });
}

// ── Voltage labels ───────────────────────────────────────────────

function VoltageLabels({ wires, parts, nodeVoltages }) {
  if (!nodeVoltages) return null;
  // Show voltage per net, positioned near first wire midpoint
  const shownNets = new Set();
  return wires.map(wire => {
    if (shownNets.has(wire.netId)) return null;
    shownNets.add(wire.netId);
    const v = nodeVoltages[wire.netId];
    if (v == null) return null;

    const fromPart = parts.find(p => p.id === wire.from.part);
    const toPart = parts.find(p => p.id === wire.to.part);
    if (!fromPart || !toPart) return null;
    const a = terminalPos(fromPart, wire.from.terminal);
    const b = terminalPos(toPart, wire.to.terminal);

    return (
      <text key={`v-${wire.netId}`}
        x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 10}
        textAnchor="middle" fill="#f1c40f" fontSize={10}
        fontFamily="monospace" fontWeight="bold">
        {fmtV(v)}
      </text>
    );
  });
}

// ── Wokwi element layer ─────────────────────────────────────────

function WokwiParts({ parts, ledBrightness, buzzerTones, onSelectPart, selectedPart, onControlChange, onButtonDown, onButtonUp, onDragStart, onHoverPart }) {
  return parts.map(part => {
    const { id, kind, params, x, y } = part;
    const rot = part.rotation || 0;
    const isSelected = selectedPart === id;
    const baseStyle = {
      position: 'absolute',
      outline: isSelected ? '2px solid #f1c40f' : 'none',
      borderRadius: '4px',
      transform: rot ? `rotate(${rot}deg)` : undefined,
      transformOrigin: 'center',
    };

    const dragProps = (extraOnDown) => ({
      onMouseDown: (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (extraOnDown) extraOnDown(e);
        else onDragStart(id);
      },
      onMouseEnter: (e) => onHoverPart(id, e.clientX, e.clientY),
      onMouseLeave: () => onHoverPart(null, 0, 0),
    });

    switch (kind) {
      case 'resistor':
        return (
          <div key={id}
            style={{ ...baseStyle, left: x - 40, top: y - 12, cursor: 'move' }}
            onClick={(e) => { e.stopPropagation(); onSelectPart(id); }}
            {...dragProps()}>
            <WokwiResistor value={String(params.ohms)} />
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 10, fontFamily: 'monospace' }}>
              {partLabel(part)}
            </div>
          </div>
        );
      case 'led': {
        const b = ledBrightness?.(id) ?? 0;
        const isOn = b > 0.01;
        return (
          <div key={id}
            style={{ ...baseStyle, left: x - 15, top: y - 20, cursor: 'move' }}
            onClick={(e) => { e.stopPropagation(); onSelectPart(id); }}
            {...dragProps()}>
            <WokwiLed color={params.color || 'red'} brightness={b} value={isOn} />
            <div style={{
              textAlign: 'center',
              color: isOn ? '#2ecc71' : '#aaa',
              fontSize: 10, fontFamily: 'monospace',
            }}>
              {isOn ? `${(b * 100).toFixed(1)}%` : 'off'}
            </div>
          </div>
        );
      }
      case 'potentiometer':
        return (
          <div key={id}
            style={{ ...baseStyle, left: x - 30, top: y - 30, cursor: 'move', pointerEvents: 'auto' }}
            onClick={(e) => { e.stopPropagation(); onSelectPart(id); }}>
            <WokwiPotentiometer
              min={0} max={1} step={0.01} value={0.5}
              onInput={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) onControlChange(id, val);
              }}
            />
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 10, fontFamily: 'monospace' }}>
              pot
            </div>
          </div>
        );
      case 'buzzer': {
        const tone = buzzerTones?.(id);
        return (
          <div key={id}
            style={{ ...baseStyle, left: x - 20, top: y - 20, cursor: 'move' }}
            onClick={(e) => { e.stopPropagation(); onSelectPart(id); }}
            {...dragProps()}>
            <WokwiBuzzer hasSignal={tone?.on ?? false} />
            <div style={{
              textAlign: 'center',
              color: tone?.on ? '#2ecc71' : '#aaa',
              fontSize: 10, fontFamily: 'monospace',
            }}>
              {tone?.on ? `${tone.hz.toFixed(0)} Hz` : 'off'}
            </div>
          </div>
        );
      }
      case 'button':
        return (
          <div key={id}
            style={{ ...baseStyle, left: x - 18, top: y - 18, cursor: 'move', pointerEvents: 'auto' }}
            onClick={(e) => { e.stopPropagation(); onSelectPart(id); }}
            onMouseDown={(e) => { e.stopPropagation(); onButtonDown(id); }}
            onMouseUp={() => onButtonUp(id)}
            onMouseLeave={() => onButtonUp(id)}>
            <WokwiPushbutton color={params.color || 'red'} />
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 10, fontFamily: 'monospace' }}>
              btn
            </div>
          </div>
        );
      case 'capacitor':
        return (
          <div key={id}
            style={{ ...baseStyle, left: x - 15, top: y - 15, cursor: 'move' }}
            onClick={(e) => { e.stopPropagation(); onSelectPart(id); }}
            {...dragProps()}>
            <svg width={30} height={30} viewBox="0 0 30 30">
              <line x1={5} y1={15} x2={12} y2={15} stroke="#7f8c8d" strokeWidth={2} />
              <line x1={12} y1={5} x2={12} y2={25} stroke="#ecf0f1" strokeWidth={2} />
              <line x1={18} y1={5} x2={18} y2={25} stroke="#ecf0f1" strokeWidth={2} />
              <line x1={18} y1={15} x2={25} y2={15} stroke="#7f8c8d" strokeWidth={2} />
            </svg>
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 10, fontFamily: 'monospace' }}>
              cap
            </div>
          </div>
        );
      default:
        return null;
    }
  });
}

// ── Wiring preview line ──────────────────────────────────────────

function WiringPreview({ wiringFrom, mousePos, parts }) {
  if (!wiringFrom || !mousePos) return null;
  const part = parts.find(p => p.id === wiringFrom.part);
  if (!part) return null;
  const from = terminalPos(part, wiringFrom.terminal);
  return (
    <line
      x1={from.x} y1={from.y}
      x2={mousePos.x} y2={mousePos.y}
      stroke="#f39c12" strokeWidth={2} strokeDasharray="5,3"
    />
  );
}

// ── Main BoardCanvas ─────────────────────────────────────────────

export function BoardCanvas({
  parts, wires, ledBrightness, buzzerTones, nodeVoltages,
  onAddWire, onRemoveWire, onRemovePart, onMovePart,
  onSelectPart, selectedPart,
  onSelectWire, selectedWire,
  onControlChange, onButtonDown, onButtonUp,
  statusText,
  placingProbe, onTerminalClickForProbe,
  circuit,
}) {
  const [wiringFrom, setWiringFrom] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [hoveredNet, setHoveredNet] = useState(null);
  const [hoveredPart, setHoveredPart] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  // Zoom/pan state: viewBox = (panX, panY, CANVAS_W/zoom, CANVAS_H/zoom)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = React.useRef(null);

  // Convert screen coordinates to canvas coordinates (accounting for zoom/pan)
  const screenToCanvas = useCallback((clientX, clientY, container) => {
    const rect = container.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: sx / zoom + pan.x,
      y: sy / zoom + pan.y,
    };
  }, [zoom, pan]);

  const handleTerminalClick = useCallback((partId, terminal) => {
    // If placing a multimeter probe, route to probe handler
    if (placingProbe && onTerminalClickForProbe) {
      onTerminalClickForProbe(partId, terminal);
      return;
    }

    if (!wiringFrom) {
      setWiringFrom({ part: partId, terminal });
    } else {
      if (wiringFrom.part !== partId || wiringFrom.terminal !== terminal) {
        onAddWire(wiringFrom.part, wiringFrom.terminal, partId, terminal);
      }
      setWiringFrom(null);
      setMousePos(null);
    }
  }, [wiringFrom, onAddWire, placingProbe, onTerminalClickForProbe]);

  const handleSvgClick = useCallback(() => {
    // Cancel wiring if clicking empty space
    if (wiringFrom) {
      setWiringFrom(null);
      setMousePos(null);
    }
    onSelectPart(null);
    onSelectWire(null);
  }, [wiringFrom, onSelectPart, onSelectWire]);

  const handleSvgMouseMove = useCallback((e) => {
    const container = e.currentTarget;
    const { x, y } = screenToCanvas(e.clientX, e.clientY, container);

    if (panning && panStart.current) {
      const rect = container.getBoundingClientRect();
      const dx = (e.clientX - panStart.current.x) / zoom;
      const dy = (e.clientY - panStart.current.y) / zoom;
      setPan(p => ({ x: p.x - dx, y: p.y - dy }));
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (wiringFrom) {
      setMousePos({ x, y });
    }
    if (dragging) {
      onMovePart(dragging, x, y);
    }
  }, [wiringFrom, dragging, onMovePart, screenToCanvas, panning, zoom]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const container = e.currentTarget;
    const { x: cx, y: cy } = screenToCanvas(e.clientX, e.clientY, container);

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.3, Math.min(3, zoom * factor));

    // Zoom toward cursor position
    setPan(p => ({
      x: cx - (cx - p.x) * (zoom / newZoom),
      y: cy - (cy - p.y) * (zoom / newZoom),
    }));
    setZoom(newZoom);
  }, [zoom, screenToCanvas]);

  const handleMouseDown = useCallback((e) => {
    // Middle button or space+left → start panning
    if (e.button === 1) {
      e.preventDefault();
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleDragStart = useCallback((e, partId) => {
    if (e.button === 0) {
      setDragging(partId);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragging(null);
    setPanning(false);
    panStart.current = null;
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedWire) {
        onRemoveWire(selectedWire);
        onSelectWire(null);
      } else if (selectedPart) {
        onRemovePart(selectedPart);
        onSelectPart(null);
      }
    }
    if (e.key === 'Escape') {
      setWiringFrom(null);
      setMousePos(null);
      onSelectPart(null);
      onSelectWire(null);
    }
    if (e.key === '0') {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [selectedPart, selectedWire, onRemovePart, onRemoveWire, onSelectPart, onSelectWire]);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Status bar */}
      <div style={{
        color: wiringFrom ? '#f39c12' : '#7f8c8d',
        fontFamily: 'monospace', fontSize: '11px',
        marginBottom: '8px', height: '16px',
      }}>
        {wiringFrom
          ? `Wiring from ${wiringFrom.part}:${wiringFrom.terminal} — click another terminal or ESC`
          : statusText || 'Click terminals to wire. Del to delete. R to rotate selected part.'}
      </div>

      {/* Zoom indicator */}
      {zoom !== 1 && (
        <div style={{
          color: '#7f8c8d', fontFamily: 'monospace', fontSize: '10px',
          marginBottom: '4px',
        }}>
          {(zoom * 100).toFixed(0)}% — scroll to zoom, middle-click to pan
        </div>
      )}

      {/* Canvas */}
      <div
        style={{
          position: 'relative',
          width: CANVAS_W,
          height: CANVAS_H,
          background: '#16213e',
          borderRadius: '8px',
          border: '1px solid #2c3e50',
          overflow: 'hidden',
        }}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleDragEnd}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      >
        <svg
          width={CANVAS_W}
          height={CANVAS_H}
          viewBox={`${pan.x} ${pan.y} ${CANVAS_W / zoom} ${CANVAS_H / zoom}`}
          style={{ position: 'absolute', top: 0, left: 0 }}
          onClick={handleSvgClick}
        >
          <defs>
            <pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
              <circle cx={10} cy={10} r={0.5} fill="#2c3e50" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Empty canvas hint */}
          {parts.length === 0 && (
            <g>
              <text x={CANVAS_W / 2} y={CANVAS_H / 2 - 30} textAnchor="middle"
                fill="#3498db" fontSize={16} fontFamily="monospace" fontWeight="bold">
                Circuit Designer
              </text>
              <text x={CANVAS_W / 2} y={CANVAS_H / 2} textAnchor="middle"
                fill="#7f8c8d" fontSize={12} fontFamily="monospace">
                Add parts from the palette, or load a preset
              </text>
              <text x={CANVAS_W / 2} y={CANVAS_H / 2 + 20} textAnchor="middle"
                fill="#7f8c8d" fontSize={11} fontFamily="monospace">
                Try "Correct (active-low)" vs "Naive (active-high)"
              </text>
              <text x={CANVAS_W / 2} y={CANVAS_H / 2 + 40} textAnchor="middle"
                fill="#7f8c8d" fontSize={11} fontFamily="monospace">
                to see why wiring matters
              </text>
            </g>
          )}

          <Wires wires={wires} parts={parts}
            selectedWire={selectedWire} onSelectWire={onSelectWire}
            hoveredNet={hoveredNet} onHoverNet={setHoveredNet}
            nodeVoltages={nodeVoltages} />
          <VoltageLabels wires={wires} parts={parts} nodeVoltages={nodeVoltages} />
          <WiringPreview wiringFrom={wiringFrom} mousePos={mousePos} parts={parts} />
          <SvgParts parts={parts} selectedPart={selectedPart} onSelectPart={onSelectPart} />
          <TerminalDots parts={parts} wires={wires} wiringFrom={wiringFrom} onTerminalClick={handleTerminalClick} placingProbe={placingProbe} />
        </svg>

        {/* Wokwi element layer — transformed to match SVG viewBox */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: `scale(${zoom}) translate(${-pan.x}px, ${-pan.y}px)`,
          pointerEvents: 'none', // let SVG handle clicks; children re-enable
        }}>
          <WokwiParts
            parts={parts}
            ledBrightness={ledBrightness}
            buzzerTones={buzzerTones}
            onSelectPart={onSelectPart}
            selectedPart={selectedPart}
            onControlChange={onControlChange}
            onButtonDown={onButtonDown}
            onButtonUp={onButtonUp}
            onDragStart={(partId) => setDragging(partId)}
            onHoverPart={(partId, cx, cy) => {
              setHoveredPart(partId);
              if (partId) setHoverPos({ x: cx, y: cy });
            }}
          />
        </div>

        {/* Part tooltip */}
        {hoveredPart && (
          <PartTooltip
            part={parts.find(p => p.id === hoveredPart)}
            circuit={circuit}
            visible={true}
            x={hoverPos.x}
            y={hoverPos.y}
          />
        )}
      </div>
    </div>
  );
}
