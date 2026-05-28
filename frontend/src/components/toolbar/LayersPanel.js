import React from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Layers } from 'lucide-react';

import { MenuItem, MenuSectionHeader } from '../ui/Menu';

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
    { key: 'statusBroken', label: 'Broken Link' },
    { key: 'statusError', label: 'Error' },
    { key: 'statusInactive', label: 'Inactive' },
    { key: 'statusAuth', label: 'Auth Required' },
    { key: 'statusDuplicate', label: 'Duplicates' },
  ].filter((option) => !!scanLayerAvailability?.[option.key]);
  const hasPlacementLayers = placementLayers.length > 0;
  const hasStatusLayers = statusLayers.length > 0;

  const LayerToggle = ({ label, active, onToggle, disabled = false }) => (
    <MenuItem
      className={`layers-panel-item${disabled ? ' disabled' : ''}`}
      label={label}
      selected={active}
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

  const panelList = (
    <div className="layers-panel-list">
      {hasPlacementLayers && (
        <>
          <MenuSectionHeader className="layers-panel-section">Placement</MenuSectionHeader>
          {placementLayers.map((option) => (
            <LayerToggle
              key={option.key}
              label={option.label}
              active={scanLayerVisibility?.[option.key]}
              onToggle={() => onToggleScanLayer(option.key)}
            />
          ))}
        </>
      )}

      {showTypeLayers && (
        <>
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
        </>
      )}

      {hasStatusLayers && (
        <>
          <MenuSectionHeader className="layers-panel-section">Status</MenuSectionHeader>
          {statusLayers.map((option) => (
            <LayerToggle
              key={option.key}
              label={option.label}
              active={scanLayerVisibility?.[option.key]}
              onToggle={() => onToggleScanLayer(option.key)}
            />
          ))}
        </>
      )}

      {showConnectionLayers && (
        <>
          <MenuSectionHeader className="layers-panel-section">Connections</MenuSectionHeader>
          {connectionAvailability?.userFlows && (
            <LayerToggle
              label="User Flows"
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
              label="Broken Links"
              active={layers.brokenLinks}
              onToggle={onToggleBrokenLinks}
            />
          )}
        </>
      )}

      {showChangeSection && (
        <>
          <MenuSectionHeader className="layers-panel-section">Markers</MenuSectionHeader>
          {changeStatusOptions.map((option) => (
            <LayerToggle
              key={option.value}
              label={option.label}
              active={changeFilters.statuses?.[option.value]}
              onToggle={() => onToggleChangeStatus?.(option.value)}
            />
          ))}
        </>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="layers-panel layers-panel-embedded">
        {panelList}
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
      {showViewDropdown && panelList}
    </div>
  );
};

export default LayersPanel;
