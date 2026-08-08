/**
 * ControlPanel — mode switch, power toggle, selection info, delete actions.
 */

import React from 'react';

export function ControlPanel({
  mode, onModeChange,
  powered, onPowerToggle,
  selectedPart, selectedWire,
  parts,
  onRemovePart, onRemoveWire,
  onUndo, onRedo, canUndo, canRedo,
  onUpdateParams,
  onSave, onLoad,
}) {
  const selPart = selectedPart ? parts.find(p => p.id === selectedPart) : null;

  return (
    <div style={{
      background: '#1a1a2e',
      border: '1px solid #2c3e50',
      borderRadius: '8px',
      padding: '12px',
      width: '180px',
      fontFamily: 'monospace',
      fontSize: '12px',
    }}>
      <h3 style={{ color: '#ecf0f1', fontSize: '13px', marginBottom: '12px' }}>
        Controls
      </h3>

      {/* Mode toggle */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ color: '#bdc3c7', fontSize: '11px' }}>Mode:</label>
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          <button
            onClick={() => onModeChange('build')}
            style={{
              flex: 1, padding: '6px',
              background: mode === 'build' ? '#2c3e50' : '#16213e',
              border: mode === 'build' ? '1px solid #3498db' : '1px solid #2c3e50',
              color: mode === 'build' ? '#3498db' : '#7f8c8d',
              borderRadius: '4px', cursor: 'pointer', fontFamily: 'monospace',
            }}
          >Build</button>
          <button
            onClick={() => onModeChange('simulate')}
            style={{
              flex: 1, padding: '6px',
              background: mode === 'simulate' ? '#2c3e50' : '#16213e',
              border: mode === 'simulate' ? '1px solid #2ecc71' : '1px solid #2c3e50',
              color: mode === 'simulate' ? '#2ecc71' : '#7f8c8d',
              borderRadius: '4px', cursor: 'pointer', fontFamily: 'monospace',
            }}
          >Sim</button>
        </div>
      </div>

      {/* Power toggle */}
      <div style={{ marginBottom: '12px' }}>
        <button
          onClick={onPowerToggle}
          style={{
            width: '100%', padding: '8px',
            background: powered ? '#27ae60' : '#c0392b',
            border: 'none', borderRadius: '4px',
            color: '#ecf0f1', fontFamily: 'monospace',
            cursor: 'pointer', fontWeight: 'bold',
          }}
        >{powered ? 'POWER ON' : 'POWER OFF'}</button>
      </div>

      {/* Undo/Redo */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          style={{
            flex: 1, padding: '6px',
            background: '#16213e',
            border: '1px solid #2c3e50',
            borderRadius: '4px',
            color: canUndo ? '#bdc3c7' : '#444',
            fontFamily: 'monospace', fontSize: '11px',
            cursor: canUndo ? 'pointer' : 'default',
          }}
        >Undo</button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          style={{
            flex: 1, padding: '6px',
            background: '#16213e',
            border: '1px solid #2c3e50',
            borderRadius: '4px',
            color: canRedo ? '#bdc3c7' : '#444',
            fontFamily: 'monospace', fontSize: '11px',
            cursor: canRedo ? 'pointer' : 'default',
          }}
        >Redo</button>
      </div>

      {/* Selection info */}
      <div style={{
        padding: '8px',
        background: '#16213e',
        borderRadius: '4px',
        marginBottom: '8px',
        minHeight: '60px',
      }}>
        <div style={{ color: '#7f8c8d', fontSize: '10px', marginBottom: '4px' }}>
          Selected:
        </div>
        {selPart ? (
          <>
            <div style={{ color: '#ecf0f1' }}>{selPart.kind}</div>
            <div style={{ color: '#7f8c8d', fontSize: '10px', marginBottom: '4px' }}>{selPart.id}</div>
            {Object.entries(selPart.params)
              .filter(([k]) => k !== 'pins') // don't edit MCU pin list
              .map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                <span style={{ color: '#7f8c8d', fontSize: '10px', minWidth: '35px' }}>{k}:</span>
                <input
                  type={typeof v === 'number' ? 'number' : 'text'}
                  value={v}
                  onChange={(e) => {
                    const newVal = typeof v === 'number'
                      ? parseFloat(e.target.value) || 0
                      : e.target.value;
                    onUpdateParams(selPart.id, { [k]: newVal });
                  }}
                  style={{
                    width: '70px', padding: '2px 4px',
                    background: '#0a0a1a', border: '1px solid #2c3e50',
                    borderRadius: '2px', color: '#ecf0f1',
                    fontFamily: 'monospace', fontSize: '10px',
                  }}
                />
              </div>
            ))}
          </>
        ) : selectedWire ? (
          <div style={{ color: '#2ecc71' }}>Wire {selectedWire}</div>
        ) : (
          <div style={{ color: '#7f8c8d' }}>Nothing</div>
        )}
      </div>

      {/* Delete */}
      {(selectedPart || selectedWire) && (
        <button
          onClick={() => {
            if (selectedWire) onRemoveWire(selectedWire);
            else if (selectedPart) onRemovePart(selectedPart);
          }}
          style={{
            width: '100%', padding: '8px',
            background: '#c0392b', border: 'none',
            borderRadius: '4px', color: '#ecf0f1',
            fontFamily: 'monospace', cursor: 'pointer',
          }}
        >Delete Selected</button>
      )}

      {/* Save/Load */}
      <div style={{ display: 'flex', gap: '4px', marginTop: '12px' }}>
        <button
          onClick={onSave}
          style={{
            flex: 1, padding: '6px',
            background: '#16213e', border: '1px solid #2c3e50',
            borderRadius: '4px', color: '#bdc3c7',
            fontFamily: 'monospace', fontSize: '11px', cursor: 'pointer',
          }}
        >Save</button>
        <label style={{
          flex: 1, padding: '6px',
          background: '#16213e', border: '1px solid #2c3e50',
          borderRadius: '4px', color: '#bdc3c7',
          fontFamily: 'monospace', fontSize: '11px', cursor: 'pointer',
          textAlign: 'center',
        }}>
          Load
          <input type="file" accept=".json" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                try { onLoad(JSON.parse(reader.result)); } catch {}
              };
              reader.readAsText(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {/* Help */}
      <div style={{ marginTop: '12px', color: '#7f8c8d', fontSize: '10px', lineHeight: '1.4' }}>
        Click red dots to wire.<br/>
        Select + Del to remove.<br/>
        Scroll to zoom, 0 to reset.<br/>
        Ctrl+Z undo, Ctrl+Y redo.<br/>
        All values from engine.
      </div>
    </div>
  );
}
