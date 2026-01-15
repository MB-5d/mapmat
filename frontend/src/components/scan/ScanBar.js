import React from 'react';
import { RotateCcw, Scan, SlidersHorizontal } from 'lucide-react';

const ScanBar = ({
  canEdit,
  urlInput,
  onUrlInputChange,
  onUrlKeyDown,
  showThumbnails,
  onToggleThumbnails,
  options,
  showOptions,
  optionsRef,
  onToggleOptions,
  onOptionChange,
  scanDepth,
  onScanDepthChange,
  onScan,
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
                <span>Scan depth</span>
                <select
                  className="layers-panel-select-input"
                  value={scanDepth}
                  onChange={(e) => onScanDepthChange(e.target.value)}
                  disabled={optionsDisabled}
                  onClick={(e) => e.stopPropagation()}
                >
                  {[...Array(8).keys()].map(i => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </label>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={showThumbnails}
                  onChange={() => onToggleThumbnails(!showThumbnails)}
                  disabled={optionsDisabled}
                />
                <span>Thumbnails</span>
              </label>
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
                  checked={options.subdomains}
                  onChange={() => onOptionChange('subdomains')}
                  disabled={optionsDisabled}
                />
                <span>Subdomains</span>
              </label>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.authenticatedPages}
                  onChange={() => onOptionChange('authenticatedPages')}
                  disabled={optionsDisabled}
                />
                <span>Authenticated Pages</span>
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
                  checked={options.brokenLinks}
                  onChange={() => onOptionChange('brokenLinks')}
                  disabled={optionsDisabled}
                />
                <span>Broken links</span>
              </label>
              <label className={`layers-panel-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.files}
                  onChange={() => onOptionChange('files')}
                  disabled={optionsDisabled}
                />
                <span>Files / Downloads</span>
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
        Scan
      </button>
    </>
  );
};

export default ScanBar;
