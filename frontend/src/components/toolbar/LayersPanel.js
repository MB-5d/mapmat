import React from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Layers } from 'lucide-react';

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
  showViewDropdown,
  onToggleDropdown,
  viewDropdownRef,
}) => {
  const showScanLayers = scanLayerAvailability
    && Object.values(scanLayerAvailability).some(Boolean);
  const showTypeLayers = false;
  const showConnectionLayers = connectionAvailability
    && Object.values(connectionAvailability).some(Boolean);
  const hasPlacementLayers = !!scanLayerAvailability?.placementPrimary
    || !!scanLayerAvailability?.placementSubdomain
    || !!scanLayerAvailability?.placementOrphan;
  const hasStatusLayers = !!scanLayerAvailability?.statusBroken
    || !!scanLayerAvailability?.statusError
    || !!scanLayerAvailability?.statusInactive
    || !!scanLayerAvailability?.statusAuth
    || !!scanLayerAvailability?.statusDuplicate;

  const LayerToggle = ({ label, active, onToggle, disabled = false }) => (
    <button
      type="button"
      className={`layers-panel-item${disabled ? ' disabled' : ''}`}
      onClick={disabled ? undefined : onToggle}
      aria-pressed={active}
      disabled={disabled}
    >
      <span>{label}</span>
      <span className="layers-panel-toggle">
        {active ? <Eye size={16} /> : <EyeOff size={16} />}
      </span>
    </button>
  );

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
      {showViewDropdown && (
        <div className="layers-panel-list">
          {showScanLayers && (
            <>
              {hasPlacementLayers && (
                <>
                  <div className="layers-panel-section">Placement</div>
                  {scanLayerAvailability?.placementPrimary && (
                    <LayerToggle
                      label="Primary"
                      active={scanLayerVisibility.placementPrimary}
                      onToggle={() => onToggleScanLayer('placementPrimary')}
                    />
                  )}
                  {scanLayerAvailability?.placementSubdomain && (
                    <LayerToggle
                      label="Subdomain"
                      active={scanLayerVisibility.placementSubdomain}
                      onToggle={() => onToggleScanLayer('placementSubdomain')}
                    />
                  )}
                  {scanLayerAvailability?.placementOrphan && (
                    <LayerToggle
                      label="Orphan"
                      active={scanLayerVisibility.placementOrphan}
                      onToggle={() => onToggleScanLayer('placementOrphan')}
                    />
                  )}
                </>
              )}

              {showTypeLayers && (
                <>
                  <div className="layers-panel-section">Type</div>
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
                  <div className="layers-panel-section">Status</div>
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
                  <div className="layers-panel-section">Connections</div>
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
        </div>
      )}
    </div>
  );
};

export default LayersPanel;
