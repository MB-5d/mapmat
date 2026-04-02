import React from 'react';
import { RotateCcw, Scan, SlidersHorizontal } from 'lucide-react';

import {
  APP_ONLY_MODE,
  SCAN_MAX_DEPTH_UI,
  TESTER_NOT_READY_MESSAGE,
  TESTER_SCAN_LIMITS_COPY,
} from '../../utils/constants';

const ScanBar = ({
  canEdit,
  urlInput,
  onUrlInputChange,
  onUrlKeyDown,
  options,
  showOptions,
  optionsRef,
  onToggleOptions,
  onOptionChange,
  scanLayerAvailability,
  scanLayerVisibility,
  onToggleScanLayer,
  scanDepth,
  onScanDepthChange,
  onScan,
  scanLabel = 'Scan',
  scanDisabled,
  scanTitle,
  sharedTitle,
  optionsDisabled,
  onClearUrl,
  showClearUrl,
}) => {
  if (!canEdit) {
    return (
      <div className="shared-map-title">
        {sharedTitle}
      </div>
    );
  }

  return (
    <>
      <Scan size={18} className="search-icon" />
      <input
        value={urlInput}
        onChange={onUrlInputChange}
        onKeyDown={onUrlKeyDown}
        onFocus={(e) => { if (!urlInput) e.target.placeholder = ''; }}
        onBlur={(e) => { if (!urlInput) e.target.placeholder = 'https://example.com'; }}
        placeholder="https://example.com"
        spellCheck={false}
      />
      {showClearUrl && (
        <button
          className="scan-clear-btn"
          type="button"
          onClick={onClearUrl}
          title="Clear URL"
        >
          <RotateCcw size={16} />
        </button>
      )}

      <div className="scan-options" ref={optionsRef}>
        <button
          className="scan-options-btn"
          onClick={onToggleOptions}
          title="Scan options"
          type="button"
        >
          <SlidersHorizontal size={16} />
          Options
        </button>
        {showOptions && (
          <div className="layers-panel">
            <div className="layers-panel-list">
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <span>Scan depth level</span>
                <select
                  className="layers-panel-select-input"
                  value={scanDepth}
                  onChange={(e) => onScanDepthChange(e.target.value)}
                  disabled={optionsDisabled}
                  onClick={(e) => e.stopPropagation()}
                >
                  {Array.from({ length: SCAN_MAX_DEPTH_UI }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <div className="layers-panel-section">Placement</div>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.subdomains}
                  onChange={() => onOptionChange('subdomains')}
                  disabled={optionsDisabled}
                />
                <span>Subdomains</span>
              </label>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.orphanPages}
                  onChange={() => onOptionChange('orphanPages')}
                  disabled={optionsDisabled}
                />
                <span>Orphan Pages</span>
              </label>

              <div className="layers-panel-section">Status</div>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.inactivePages}
                  onChange={() => onOptionChange('inactivePages')}
                  disabled={optionsDisabled}
                />
                <span>Inactive pages</span>
              </label>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.errorPages}
                  onChange={() => onOptionChange('errorPages')}
                  disabled={optionsDisabled}
                />
                <span>Error pages</span>
              </label>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.duplicates}
                  onChange={() => onOptionChange('duplicates')}
                  disabled={optionsDisabled}
                />
                <span>Duplicates</span>
              </label>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.authenticatedPages}
                  onChange={() => onOptionChange('authenticatedPages')}
                  disabled={optionsDisabled || APP_ONLY_MODE}
                />
                <span>Authenticated Pages</span>
              </label>
              {APP_ONLY_MODE && (
                <div className="layers-panel-hint">
                  {TESTER_NOT_READY_MESSAGE}: prompted-login crawling is disabled during testing.
                </div>
              )}

              <div className="layers-panel-section">Type</div>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.files}
                  onChange={() => onOptionChange('files')}
                  disabled={optionsDisabled}
                />
                <span>Files / Downloads</span>
              </label>

              <div className="layers-panel-section">Connections</div>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.brokenLinks}
                  onChange={() => onOptionChange('brokenLinks')}
                  disabled={optionsDisabled}
                />
                <span>Broken links</span>
              </label>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.crosslinks}
                  onChange={() => onOptionChange('crosslinks')}
                  disabled={optionsDisabled}
                />
                <span>Crosslinks</span>
              </label>
              <div className="layers-panel-hint">
                {TESTER_SCAN_LIMITS_COPY}
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        className="scan-btn"
        onClick={onScan}
        disabled={scanDisabled}
        title={scanTitle}
      >
        {scanLabel}
      </button>
    </>
  );
};

export default ScanBar;
