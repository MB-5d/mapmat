import React, { useState, useEffect, useMemo } from 'react';
import { HexColorPicker } from 'react-colorful';
import { X } from 'lucide-react';

const EditColorModal = ({ depth, color, onChange, onClose, position }) => {
  const [currentColor, setCurrentColor] = useState(color || '#6366f1');
  
  // Parse hex to RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 99, g: 102, b: 241 };
  };

  const [rgb, setRgb] = useState(hexToRgb(color));
  const [hexInput, setHexInput] = useState(color || '#6366f1');

  useEffect(() => {
    setCurrentColor(color);
    setRgb(hexToRgb(color));
    setHexInput(color);
  }, [color]);

  const normalizeHex = (value) => {
    if (!value) return null;
    const trimmed = value.trim();
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase();
    return null;
  };

  const handleColorChange = (newColor) => {
    setCurrentColor(newColor);
    setRgb(hexToRgb(newColor));
    setHexInput(newColor);
    onChange(newColor);
  };

  const handleRgbChange = (channel, value) => {
    const numValue = Math.min(255, Math.max(0, parseInt(value) || 0));
    const newRgb = { ...rgb, [channel]: numValue };
    setRgb(newRgb);
    const newHex = `#${newRgb.r.toString(16).padStart(2, '0')}${newRgb.g.toString(16).padStart(2, '0')}${newRgb.b.toString(16).padStart(2, '0')}`;
    setCurrentColor(newHex);
    setHexInput(newHex);
    onChange(newHex);
  };

  const modalStyle = useMemo(() => {
    if (!position) return {};
    const modalWidth = 280;
    const modalHeight = 360;
    const viewportW = window.innerWidth || 1024;
    const viewportH = window.innerHeight || 768;
    const anchorHeight = position.height || 28;
    const anchorTop = position.top ?? 0;
    const swatchCenterOffset = 290;
    const anchorCenterY = anchorTop + anchorHeight / 2;
    const top = Math.min(
      Math.max(20, anchorCenterY - swatchCenterOffset),
      viewportH - modalHeight - 20
    );
    let left = position.right + 12;
    if (left + modalWidth > viewportW - 20 && position.left) {
      left = position.left - modalWidth - 12;
    }
    left = Math.max(20, Math.min(left, viewportW - modalWidth - 20));
    return {
      position: 'fixed',
      top,
      left,
    };
  }, [position]);

  if (depth === null || depth === undefined) return null;

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="color-picker-backdrop"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="color-picker-modal anchored"
        style={modalStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose}>
          <X size={24} />
        </button>
        
        <div className="color-picker-content">
          <div className="color-picker-gradient">
            <HexColorPicker color={currentColor} onChange={handleColorChange} />
          </div>

          <div className="color-picker-hex">
            <label htmlFor="color-hex-input">Hex</label>
            <input
              id="color-hex-input"
              type="text"
              value={hexInput}
              onChange={(e) => {
                const nextValue = e.target.value;
                setHexInput(nextValue);
                const normalized = normalizeHex(nextValue);
                if (normalized) handleColorChange(normalized);
              }}
              onBlur={() => {
                const normalized = normalizeHex(hexInput);
                if (normalized) {
                  setHexInput(normalized);
                } else {
                  setHexInput(currentColor);
                }
              }}
              placeholder="#6366f1"
              spellCheck={false}
            />
          </div>

          {/* RGB inputs */}
          <div className="color-picker-rgb">
            <div className="color-picker-swatch" style={{ backgroundColor: currentColor }} />
            <div className="rgb-inputs">
              <div className="rgb-input-group">
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={rgb.r}
                  onChange={(e) => handleRgbChange('r', e.target.value)}
                />
                <label>R</label>
              </div>
              <div className="rgb-input-group">
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={rgb.g}
                  onChange={(e) => handleRgbChange('g', e.target.value)}
                />
                <label>G</label>
              </div>
              <div className="rgb-input-group">
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={rgb.b}
                  onChange={(e) => handleRgbChange('b', e.target.value)}
                />
                <label>B</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditColorModal;
