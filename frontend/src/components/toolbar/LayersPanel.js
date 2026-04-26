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
  const showScanLayers = scanLayerAvailability
    && Object.values(scanLayerAvailability).some(Boolean);
  const showTypeLayers = false;
  const showConnectionLayers = connectionAvailability
    && Object.values(connectionAvailability).some(Boolean);
  const hasPlacementLayers = !!scanLayerAvailability;
  const hasStatusLayers = !!scanLayerAvailability?.statusBroken
    || !!scanLayerAvailability?.statusError
    || !!scanLayerAvailability?.statusInactive
    || !!scanLayerAvailability?.statusAuth
    || !!scanLayerAvailability?.statusDuplicate;

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
          {showScanLayers && (
            <>
              {hasPlacementLayers && (
                <>
                  <MenuSectionHeader className="layers-panel-section">Placement</MenuSectionHeader>
                  <LayerToggle
                    label="Primary"
                    active={scanLayerVisibility.placementPrimary}
                    onToggle={() => onToggleScanLayer('placementPrimary')}
                    disabled={!scanLayerAvailability?.placementPrimary}
                  />
                  <LayerToggle
                    label="Subdomain"
                    active={scanLayerVisibility.placementSubdomain}
                    onToggle={() => onToggleScanLayer('placementSubdomain')}
                    disabled={!scanLayerAvailability?.placementSubdomain}
                  />
                  <LayerToggle
                    label="Orphan"
                    active={scanLayerVisibility.placementOrphan}
                    onToggle={() => onToggleScanLayer('placementOrphan')}
                    disabled={!scanLayerAvailability?.placementOrphan}
                  />
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
                  {scanLayerAvailability?.statusBroken && (
                    <LayerToggle
                      label="Broken Link"
                      active={scanLayerVisibility.statusBroken}
                      onToggle={() => onToggleScanLayer('statusBroken')}
                    />
                  )}
                  {scanLayerAvailability?.statusError && (
                    <LayerToggle
                      label="Error"
                      active={scanLayerVisibility.statusError}
                      onToggle={() => onToggleScanLayer('statusError')}
                    />
                  )}
                  {scanLayerAvailability?.statusInactive && (
                    <LayerToggle
                      label="Inactive"
                      active={scanLayerVisibility.statusInactive}
                      onToggle={() => onToggleScanLayer('statusInactive')}
                    />
                  )}
                  {scanLayerAvailability?.statusAuth && (
                    <LayerToggle
                      label="Auth Required"
                      active={scanLayerVisibility.statusAuth}
                      onToggle={() => onToggleScanLayer('statusAuth')}
                    />
                  )}
                  {scanLayerAvailability?.statusDuplicate && (
                    <LayerToggle
                      label="Duplicates"
                      active={scanLayerVisibility.statusDuplicate}
                      onToggle={() => onToggleScanLayer('statusDuplicate')}
                    />
                  )}
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
