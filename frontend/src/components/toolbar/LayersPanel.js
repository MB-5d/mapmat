import React from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';

const LayersPanel = ({
  layers,
  connectionTool,
  onToggleUserFlows,
  onToggleCrossLinks,
  showThumbnails,
  onToggleThumbnails,
  showPageNumbers,
  onTogglePageNumbers,
  scanLayerAvailability,
  scanLayerVisibility,
  onToggleScanLayer,
  showViewDropdown,
  onToggleDropdown,
  viewDropdownRef,
}) => {
  const showScanLayers = scanLayerAvailability
    && Object.values(scanLayerAvailability).some(Boolean);

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
          <label className="layers-panel-item">
            <input
              type="checkbox"
              checked={layers.main}
              disabled
              onChange={() => {}}
            />
            <span>Main / URL</span>
          </label>
         
          <label className="layers-panel-item">
            <input
              type="checkbox"
              checked={showPageNumbers}
              onChange={onTogglePageNumbers}
            />
            <span>Page Numbers</span>
          </label>
          <label className="layers-panel-item">
            <input
              type="checkbox"
              checked={layers.userFlows}
              onChange={() => onToggleUserFlows(connectionTool)}
            />
            <span>User Flows</span>
          </label>
          <label className="layers-panel-item">
            <input
              type="checkbox"
              checked={layers.crossLinks}
              onChange={() => onToggleCrossLinks(connectionTool)}
            />
            <span>Cross-links</span>
          </label>
          <label className="layers-panel-item disabled">
            <input
              type="checkbox"
              checked={layers.xmlComparison}
              disabled
              onChange={() => {}}
            />
            <span>XML Comparison</span>
          </label>

          {showScanLayers && (
            <div className="layers-panel-section">Scan Layers</div>
          )}
          {scanLayerAvailability?.subdomains && (
            <label className="layers-panel-item">
              <input
                type="checkbox"
                checked={scanLayerVisibility.subdomains}
                onChange={() => onToggleScanLayer('subdomains')}
              />
              <span>Subdomains</span>
            </label>
          )}
          {scanLayerAvailability?.thumbnails && (
            <label className="layers-panel-item">
              <input
                type="checkbox"
                checked={scanLayerVisibility.thumbnails}
                onChange={() => onToggleScanLayer('thumbnails')}
              />
              <span>Thumbnails</span>
            </label>
          )}
          {scanLayerAvailability?.inactivePages && (
            <label className="layers-panel-item">
              <input
                type="checkbox"
                checked={scanLayerVisibility.inactivePages}
                onChange={() => onToggleScanLayer('inactivePages')}
              />
              <span>Inactive Pages</span>
            </label>
          )}
          {scanLayerAvailability?.authenticatedPages && (
            <label className="layers-panel-item">
              <input
                type="checkbox"
                checked={scanLayerVisibility.authenticatedPages}
                onChange={() => onToggleScanLayer('authenticatedPages')}
              />
              <span>Authenticated Pages</span>
            </label>
          )}
          {scanLayerAvailability?.orphanPages && (
            <label className="layers-panel-item">
              <input
                type="checkbox"
                checked={scanLayerVisibility.orphanPages}
                onChange={() => onToggleScanLayer('orphanPages')}
              />
              <span>Orphan Pages</span>
            </label>
          )}
          {scanLayerAvailability?.errorPages && (
            <label className="layers-panel-item">
              <input
                type="checkbox"
                checked={scanLayerVisibility.errorPages}
                onChange={() => onToggleScanLayer('errorPages')}
              />
              <span>Error Pages</span>
            </label>
          )}
          {scanLayerAvailability?.brokenLinks && (
            <label className="layers-panel-item">
              <input
                type="checkbox"
                checked={scanLayerVisibility.brokenLinks}
                onChange={() => onToggleScanLayer('brokenLinks')}
              />
              <span>Broken Links</span>
            </label>
          )}
          {scanLayerAvailability?.files && (
            <label className="layers-panel-item">
              <input
                type="checkbox"
                checked={scanLayerVisibility.files}
                onChange={() => onToggleScanLayer('files')}
              />
              <span>Files / Downloads</span>
            </label>
          )}
        </div>
      )}
    </div>
  );
};

export default LayersPanel;
