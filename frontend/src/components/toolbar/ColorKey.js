import React from 'react';
import { ChevronDown, ChevronUp, Edit2, Palette } from 'lucide-react';

const ColorKey = ({
  showColorKey,
  onToggle,
  colors,
  maxDepth,
  onEditDepth,
  editingDepth,
}) => (
  <div className="color-key">
    <div className="color-key-header" onClick={onToggle}>
      <div className="color-key-title">
        <Palette size={16} />
        <span>Legend</span>
      </div>
      <button className="key-toggle">
        {showColorKey ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
    </div>
    {showColorKey && (
      <div className="color-key-list">
        <div className="color-key-section">Pages</div>
        {Array.from({ length: Math.max(maxDepth + 1, colors.length) }).map((_, idx) => {
          const color = colors[idx] || colors[colors.length - 1];
          if (idx > maxDepth) return null;
          return (
            <div
              key={idx}
              className={`color-key-item ${editingDepth === idx ? 'editing' : ''}`}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onEditDepth(idx, {
                  top: rect.top,
                  right: rect.right,
                  left: rect.left,
                  height: rect.height,
                });
              }}
            >
            <div className={`color-swatch ${editingDepth === idx ? 'editing' : ''}`} style={{ backgroundColor: color }} />
            <span>Level {idx}</span>
            <Edit2 size={12} className="color-edit-icon" />
          </div>
          );
        })}
        <div className="color-key-section">Connections</div>
        <div className="color-key-item static">
          <span className="legend-line legend-userflow" />
          <span>User Flows</span>
        </div>
        <div className="color-key-item static">
          <span className="legend-line legend-crosslink" />
          <span>Crosslinks</span>
        </div>
        <div className="color-key-item static">
          <span className="legend-line legend-broken" />
          <span>Broken Links</span>
        </div>
      </div>
    )}
  </div>
);

export default ColorKey;
