import React from 'react';
import { Scan, SlidersHorizontal } from 'lucide-react';

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
          <div className="scan-options-menu">
            <div className="scan-options-depth">
              <label htmlFor="scan-depth-input">Scan depth</label>
              <input
                id="scan-depth-input"
                className="scan-options-depth-input"
                type="text"
                inputMode="numeric"
                value={scanDepth}
                onChange={(e) => onScanDepthChange(e.target.value)}
                list="scan-depth-options"
              />
              <datalist id="scan-depth-options">
                <option value="1" />
                <option value="2" />
                <option value="3" />
                <option value="4" />
                <option value="5" />
                <option value="6" />
                <option value="7" />
                <option value="8" />
                <option value="9" />
                <option value="10" />
              </datalist>
            </div>
            <label className="scan-options-item">
              <input
                type="checkbox"
                checked={showThumbnails}
                onChange={() => onToggleThumbnails(!showThumbnails)}
              />
              <span>Thumbnails</span>
            </label>
            <label className="scan-options-item">
              <input
                type="checkbox"
                checked={options.subdomains}
                onChange={() => onOptionChange('subdomains')}
              />
              <span>Subdomains</span>
            </label>
            <label className="scan-options-item">
              <input
                type="checkbox"
                checked={options.authenticatedPages}
                onChange={() => onOptionChange('authenticatedPages')}
              />
              <span>Authenticated Pages</span>
            </label>
            <label className="scan-options-item">
              <input
                type="checkbox"
                checked={options.orphanPages}
                onChange={() => onOptionChange('orphanPages')}
              />
              <span>Orphan Pages</span>
            </label>
            <label className="scan-options-item">
              <input
                type="checkbox"
                checked={options.errorPages}
                onChange={() => onOptionChange('errorPages')}
              />
              <span>Error pages</span>
            </label>
            <label className="scan-options-item">
              <input
                type="checkbox"
                checked={options.brokenLinks}
                onChange={() => onOptionChange('brokenLinks')}
              />
              <span>Broken links</span>
            </label>
            <label className="scan-options-item">
              <input
                type="checkbox"
                checked={options.files}
                onChange={() => onOptionChange('files')}
              />
              <span>Files / Downloads</span>
            </label>
            <label className="scan-options-item">
              <input
                type="checkbox"
                checked={options.crosslinks}
                onChange={() => onOptionChange('crosslinks')}
              />
              <span>Crosslinks</span>
            </label>
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
