import React from 'react';
import { Image, ImageOff, Scan } from 'lucide-react';

const ScanBar = ({
  canEdit,
  urlInput,
  onUrlInputChange,
  onUrlKeyDown,
  showThumbnails,
  onToggleThumbnails,
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

      <button
        className="thumb-toggle-btn"
        onClick={onToggleThumbnails}
        title={showThumbnails ? 'Hide thumbnails' : 'Show thumbnails'}
      >
        <div className={`thumb-toggle-track ${showThumbnails ? 'active' : ''}`}>
          <ImageOff size={14} className="thumb-icon off" />
          <Image size={14} className="thumb-icon on" />
          <div className="thumb-toggle-thumb" />
        </div>
      </button>

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
