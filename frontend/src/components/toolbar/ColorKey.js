import React from 'react';
import { ChevronDown, ChevronUp, Edit2, Palette } from 'lucide-react';

const ColorKey = ({
  showColorKey,
  onToggle,
  colors,
  connectionColors,
  maxDepth,
  canEdit,
  onEditDepth,
  editingDepth,
  editingConnectionKey,
  onEditConnectionColor,
  connectionLegend,
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
              className={`color-key-item ${editingDepth === idx ? 'editing' : ''}${!canEdit ? ' disabled' : ''}`}
              onClick={(e) => {
                if (!canEdit) return;
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
            {canEdit ? <Edit2 size={12} className="color-edit-icon" /> : null}
          </div>
          );
        })}
        {connectionLegend?.hasAny && (
          <>
            <div className="color-key-section">Connections</div>
            {connectionLegend?.hasUserFlows && (
              <div
                className={`color-key-item ${editingConnectionKey === 'userFlows' ? 'editing' : ''}${!canEdit ? ' disabled' : ''}`}
                onClick={(e) => {
                  if (!canEdit) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  onEditConnectionColor?.('userFlows', {
                    top: rect.top,
                    right: rect.right,
                    left: rect.left,
                    height: rect.height,
                  });
                }}
              >
                <span
                  className="legend-line legend-line-solid"
                  style={{ '--legend-color': connectionColors?.userFlows || '#14b8a6' }}
                />
                <span>User Flows</span>
                {canEdit ? <Edit2 size={12} className="color-edit-icon" /> : null}
              </div>
            )}
            {connectionLegend?.hasCrossLinks && (
              <div
                className={`color-key-item ${editingConnectionKey === 'crossLinks' ? 'editing' : ''}${!canEdit ? ' disabled' : ''}`}
                onClick={(e) => {
                  if (!canEdit) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  onEditConnectionColor?.('crossLinks', {
                    top: rect.top,
                    right: rect.right,
                    left: rect.left,
                    height: rect.height,
                  });
                }}
              >
                <span
                  className="legend-line legend-line-crosslinks"
                  style={{ '--legend-color': connectionColors?.crossLinks || '#f97316' }}
                />
                <span>Crosslinks</span>
                {canEdit ? <Edit2 size={12} className="color-edit-icon" /> : null}
              </div>
            )}
            {connectionLegend?.hasBrokenLinks && (
              <div
                className={`color-key-item ${editingConnectionKey === 'brokenLinks' ? 'editing' : ''}${!canEdit ? ' disabled' : ''}`}
                onClick={(e) => {
                  if (!canEdit) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  onEditConnectionColor?.('brokenLinks', {
                    top: rect.top,
                    right: rect.right,
                    left: rect.left,
                    height: rect.height,
                  });
                }}
              >
                <span
                  className="legend-line legend-line-broken"
                  style={{ '--legend-color': connectionColors?.brokenLinks || '#fca5a5' }}
                />
                <span>Broken Links</span>
                {canEdit ? <Edit2 size={12} className="color-edit-icon" /> : null}
              </div>
            )}
          </>
        )}
      </div>
    )}
  </div>
);

export default ColorKey;
