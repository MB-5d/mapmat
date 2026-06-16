import React from 'react';
import { ChevronDown, ChevronUp, Palette } from 'lucide-react';

import { DEFAULT_CONNECTION_COLORS, getDepthColor } from '../../utils/constants';
import { MenuItem, MenuSection, MenuSectionHeader, MenuTitle } from '../ui/Menu';
import { EditIcon } from '../ui/icons';

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
  embedded = false,
}) => {
  const levelRows = Array.from({ length: Math.max(maxDepth + 1, colors.length) }).map((_, idx) => {
    const color = getDepthColor(colors, idx);
    if (idx > maxDepth) return null;
    return (
      <MenuItem
        key={idx}
        as={canEdit ? 'button' : 'div'}
        className={`color-key-item ${editingDepth === idx ? 'editing' : ''}${!canEdit ? ' static' : ''}`}
        icon={<span className={`color-swatch ${editingDepth === idx ? 'editing' : ''}`} style={{ backgroundColor: color }} />}
        label={`Level ${idx}`}
        onClick={canEdit ? (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onEditDepth(idx, {
            top: rect.top,
            right: rect.right,
            left: rect.left,
            height: rect.height,
          });
        } : undefined}
        endSlot={canEdit ? <EditIcon size={12} className="color-edit-icon" /> : null}
      />
    );
  });

  const connectionRows = connectionLegend?.hasAny ? (
    <MenuSection>
      <MenuSectionHeader className="color-key-section">Connections</MenuSectionHeader>
      {connectionLegend?.hasUserFlows ? (
        <MenuItem
          as={canEdit ? 'button' : 'div'}
          className={`color-key-item ${editingConnectionKey === 'userFlows' ? 'editing' : ''}${!canEdit ? ' static' : ''}`}
          icon={<span className="legend-line legend-line-solid" style={{ '--legend-color': connectionColors?.userFlows || DEFAULT_CONNECTION_COLORS.userFlows }} />}
          label="User Flows"
          onClick={canEdit ? (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onEditConnectionColor?.('userFlows', {
              top: rect.top,
              right: rect.right,
              left: rect.left,
              height: rect.height,
            });
          } : undefined}
          endSlot={canEdit ? <EditIcon size={12} className="color-edit-icon" /> : null}
        />
      ) : null}
      {connectionLegend?.hasCrossLinks ? (
        <MenuItem
          as={canEdit ? 'button' : 'div'}
          className={`color-key-item ${editingConnectionKey === 'crossLinks' ? 'editing' : ''}${!canEdit ? ' static' : ''}`}
          icon={<span className="legend-line legend-line-crosslinks" style={{ '--legend-color': connectionColors?.crossLinks || DEFAULT_CONNECTION_COLORS.crossLinks }} />}
          label="Crosslinks"
          onClick={canEdit ? (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onEditConnectionColor?.('crossLinks', {
              top: rect.top,
              right: rect.right,
              left: rect.left,
              height: rect.height,
            });
          } : undefined}
          endSlot={canEdit ? <EditIcon size={12} className="color-edit-icon" /> : null}
        />
      ) : null}
      {connectionLegend?.hasBrokenLinks ? (
        <MenuItem
          as={canEdit ? 'button' : 'div'}
          className={`color-key-item ${editingConnectionKey === 'brokenLinks' ? 'editing' : ''}${!canEdit ? ' static' : ''}`}
          icon={<span className="legend-line legend-line-broken" style={{ '--legend-color': connectionColors?.brokenLinks || DEFAULT_CONNECTION_COLORS.brokenLinks }} />}
          label="Broken Links"
          onClick={canEdit ? (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onEditConnectionColor?.('brokenLinks', {
              top: rect.top,
              right: rect.right,
              left: rect.left,
              height: rect.height,
            });
          } : undefined}
          endSlot={canEdit ? <EditIcon size={12} className="color-edit-icon" /> : null}
        />
      ) : null}
    </MenuSection>
  ) : null;

  const listContent = (
    <div className="color-key-list">
      <MenuSection>
        <MenuSectionHeader className="color-key-section">Levels</MenuSectionHeader>
        {levelRows}
      </MenuSection>
      {connectionRows}
    </div>
  );

  return (
    <div className={`color-key${embedded ? ' color-key-embedded' : ''}`}>
      {!embedded && (
        <div className="color-key-header" onClick={onToggle}>
          <div className="color-key-title">
            <Palette size={16} />
            <span>Legend</span>
          </div>
          <button className="key-toggle">
            {showColorKey ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      )}
      {embedded ? (
        <>
          <MenuTitle>Legend</MenuTitle>
          {listContent}
        </>
      ) : ((embedded || showColorKey) && listContent)}
    </div>
  );
};

export default ColorKey;
