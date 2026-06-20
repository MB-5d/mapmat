import React from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Layers } from 'lucide-react';

import { MenuItem, MenuSection, MenuSectionHeader, MenuTitle } from '../ui/Menu';

const LayersPanel = ({
  layers,
  connectionTool,
  onToggleUserFlows,
  onToggleCrossLinks,
  onToggleBrokenLinks,
  connectionAvailability,
  scanLayerAvailability,
  scanLayerVisibility,
  onToggleScanLayer,
  changeFilters = { statuses: {} },
  onToggleChangeStatus,
  changeStatusOptions = [],
  showChangeSection = false,
  showViewDropdown,
  onToggleDropdown,
  viewDropdownRef,
  embedded = false,
}) => {
  const showTypeLayers = false;
  const showConnectionLayers = connectionAvailability
    && Object.values(connectionAvailability).some(Boolean);
  const placementLayers = [
    { key: 'placementPrimary', label: 'Primary' },
    { key: 'placementSubdomain', label: 'Subdomain' },
    { key: 'placementOrphan', label: 'Orphan' },
  ].filter((option) => !!scanLayerAvailability?.[option.key]);
  const statusLayers = [
    { key: 'statusMissing', label: 'Missing' },
    { key: 'statusDuplicate', label: 'Duplicate' },
    { key: 'statusBroken', label: 'Broken link' },
    { key: 'statusError', label: 'Error' },
    { key: 'statusInactive', label: 'Inactive' },
    { key: 'statusAuth', label: 'Auth required' },
  ].filter((option) => !!scanLayerAvailability?.[option.key]);
  const hasPlacementLayers = placementLayers.length > 0;
  const hasStatusLayers = statusLayers.length > 0;

  const LayerToggle = ({ label, active, onToggle, disabled = false }) => (
    <MenuItem
      className={`layers-panel-item${disabled ? ' disabled' : ''}`}
      label={label}
      onClick={disabled ? undefined : onToggle}
      role="menuitemcheckbox"
      aria-checked={active}
      disabled={disabled}
      endSlot={(
        <span className="layers-panel-toggle">
          {active ? <Eye size={16} /> : <EyeOff size={16} />}
        </span>
      )}
    />
  );

  const panelSections = (
    <div className="layers-panel-list">
      {hasPlacementLayers && (
        <MenuSection>
          <MenuSectionHeader className="layers-panel-section">Placement</MenuSectionHeader>
          {placementLayers.map((option) => (
            <LayerToggle
              key={option.key}
              label={option.label}
              active={scanLayerVisibility?.[option.key]}
              onToggle={() => onToggleScanLayer(option.key)}
            />
          ))}
        </MenuSection>
      )}

      {showTypeLayers && (
        <MenuSection>
          <MenuSectionHeader className="layers-panel-section">Type</MenuSectionHeader>
          {scanLayerAvailability?.typePages && (
            <LayerToggle
              label="Pages"
              active={scanLayerVisibility.typePages}
              onToggle={() => onToggleScanLayer('typePages')}
            />
          )}
          {scanLayerAvailability?.typeFiles && (
            <LayerToggle
              label="Files"
              active={scanLayerVisibility.typeFiles}
              onToggle={() => onToggleScanLayer('typeFiles')}
            />
          )}
        </MenuSection>
      )}

      {hasStatusLayers && (
        <MenuSection>
          <MenuSectionHeader className="layers-panel-section">Status</MenuSectionHeader>
          {statusLayers.map((option) => (
            <LayerToggle
              key={option.key}
              label={option.label}
              active={scanLayerVisibility?.[option.key]}
              onToggle={() => onToggleScanLayer(option.key)}
            />
          ))}
        </MenuSection>
      )}

      {showConnectionLayers && (
        <MenuSection>
          <MenuSectionHeader className="layers-panel-section">Connections</MenuSectionHeader>
          {connectionAvailability?.userFlows && (
            <LayerToggle
              label="User flows"
              active={layers.userFlows}
              onToggle={() => onToggleUserFlows(connectionTool)}
            />
          )}
          {connectionAvailability?.crossLinks && (
            <LayerToggle
              label="Cross-links"
              active={layers.crossLinks}
              onToggle={() => onToggleCrossLinks(connectionTool)}
            />
          )}
          {connectionAvailability?.brokenLinks && (
            <LayerToggle
              label="Broken links"
              active={layers.brokenLinks}
              onToggle={onToggleBrokenLinks}
            />
          )}
        </MenuSection>
      )}

      {showChangeSection && (
        <MenuSection>
          <MenuSectionHeader className="layers-panel-section">Markers</MenuSectionHeader>
          {changeStatusOptions.map((option) => (
            <LayerToggle
              key={option.value}
              label={option.label}
              active={changeFilters.statuses?.[option.value]}
              onToggle={() => onToggleChangeStatus?.(option.value)}
            />
          ))}
        </MenuSection>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="layers-panel layers-panel-embedded">
        <MenuTitle>Layers</MenuTitle>
        {panelSections}
      </div>
    );
  }

  return (
    <div className={`layers-panel ${showViewDropdown ? 'expanded' : ''}`} ref={viewDropdownRef}>
      <div
        className="layers-panel-header"
        onClick={onToggleDropdown}
      >
        <div className="layers-panel-title">
          <Layers size={16} />
          <span>Layers</span>
        </div>
        <button className="key-toggle">
          {showViewDropdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {showViewDropdown && panelSections}
    </div>
  );
};

export default LayersPanel;
