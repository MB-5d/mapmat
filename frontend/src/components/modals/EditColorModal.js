import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const EditColorModal = ({ depth, color, onChange, onClose }) => {
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

  useEffect(() => {
    setCurrentColor(color);
    setRgb(hexToRgb(color));
  }, [color]);

  const handleColorChange = (e) => {
    const newColor = e.target.value;
    setCurrentColor(newColor);
    setRgb(hexToRgb(newColor));
    onChange(newColor);
  };

  const handleRgbChange = (channel, value) => {
    const numValue = Math.min(255, Math.max(0, parseInt(value) || 0));
    const newRgb = { ...rgb, [channel]: numValue };
    setRgb(newRgb);
    const newHex = `#${newRgb.r.toString(16).padStart(2, '0')}${newRgb.g.toString(16).padStart(2, '0')}${newRgb.b.toString(16).padStart(2, '0')}`;
    setCurrentColor(newHex);
    onChange(newHex);
  };

  if (depth === null || depth === undefined) return null;

  return (
    <div className="modal-overlay color-picker-overlay" onClick={onClose}>
      <div className="color-picker-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={16} />
        </button>
        
        <div className="color-picker-content">
          {/* Native color picker - renders as gradient picker */}
          <div className="color-picker-gradient">
            <input
              type="color"
              value={currentColor}
              onChange={handleColorChange}
              className="color-input-native"
            />
          </div>
          
          {/* Color slider bar */}
          <div className="color-picker-hue">
            <input
              type="range"
              min="0"
              max="360"
              className="hue-slider"
              onChange={(e) => {
                // Convert hue to hex (simplified - keeps saturation/lightness)
                const hue = e.target.value;
                const saturation = 100;
                const lightness = 50;
                // HSL to RGB conversion
                const c = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
                const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
                const m = lightness / 100 - c / 2;
                let r, g, b;
                if (hue < 60) { r = c; g = x; b = 0; }
                else if (hue < 120) { r = x; g = c; b = 0; }
                else if (hue < 180) { r = 0; g = c; b = x; }
                else if (hue < 240) { r = 0; g = x; b = c; }
                else if (hue < 300) { r = x; g = 0; b = c; }
                else { r = c; g = 0; b = x; }
                const newHex = `#${Math.round((r + m) * 255).toString(16).padStart(2, '0')}${Math.round((g + m) * 255).toString(16).padStart(2, '0')}${Math.round((b + m) * 255).toString(16).padStart(2, '0')}`;
                setCurrentColor(newHex);
                setRgb(hexToRgb(newHex));
                onChange(newHex);
              }}
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