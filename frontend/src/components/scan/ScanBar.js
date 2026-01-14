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
