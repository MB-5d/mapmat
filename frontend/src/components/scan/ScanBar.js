import React from 'react';
import { RotateCcw, Scan, SlidersHorizontal } from 'lucide-react';

import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import { MenuSectionHeader } from '../ui/Menu';
import SelectInput from '../ui/SelectInput';
import TextInput from '../ui/TextInput';
import {
  APP_ONLY_MODE,
  SCAN_MAX_DEPTH_UI,
  TESTER_NOT_READY_MESSAGE,
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
      <Scan size={18} className="scan-bar__icon" />
      <TextInput
        className="scan-bar__input"
        value={urlInput}
        onChange={onUrlInputChange}
        onKeyDown={onUrlKeyDown}
        onFocus={(e) => { if (!urlInput) e.target.placeholder = ''; }}
        onBlur={(e) => { if (!urlInput) e.target.placeholder = 'https://example.com'; }}
        placeholder="https://example.com"
        spellCheck={false}
      />
      {showClearUrl && (
        <IconButton
          className="scan-clear-btn"
          size="sm"
          variant="ghost"
          icon={<RotateCcw size={16} />}
          label="Clear URL"
          type="button"
          onClick={onClearUrl}
          title="Clear URL"
        />
      )}

      <div className="scan-options" ref={optionsRef}>
        <Button
          className="scan-options-btn"
          size="sm"
          variant="secondary"
          startIcon={<SlidersHorizontal size={16} />}
          onClick={onToggleOptions}
          title="Scan options"
          type="button"
        >
          Options
        </Button>
        {showOptions && (
          <div className="layers-panel">
            <div className="layers-panel-list">
              <label className={`layers-panel-item ui-menu-item${optionsDisabled ? ' disabled' : ''}`}>
                <span>Levels</span>
                <SelectInput
                  className="layers-panel-select-input"
                  size="sm"
                  value={scanDepth}
                  onChange={(e) => onScanDepthChange(e.target.value)}
                  disabled={optionsDisabled}
                  onClick={(e) => e.stopPropagation()}
                >
                  {Array.from({ length: SCAN_MAX_DEPTH_UI }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </SelectInput>
              </label>
              <div className="layers-panel-hint">
                Max {SCAN_MAX_DEPTH_UI} levels during testing
              </div>
              <MenuSectionHeader className="layers-panel-section">Placement</MenuSectionHeader>
              <label className={`layers-panel-item ui-menu-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.subdomains}
                  onChange={() => onOptionChange('subdomains')}
                  disabled={optionsDisabled}
                />
                <span>Subdomains</span>
              </label>
              <label className={`layers-panel-item ui-menu-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.orphanPages}
                  onChange={() => onOptionChange('orphanPages')}
                  disabled={optionsDisabled}
                />
                <span>Orphan Pages</span>
              </label>
              <MenuSectionHeader className="layers-panel-section">Status</MenuSectionHeader>
              <label className={`layers-panel-item ui-menu-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.inactivePages}
                  onChange={() => onOptionChange('inactivePages')}
                  disabled={optionsDisabled}
                />
                <span>Inactive pages</span>
              </label>
              <label className={`layers-panel-item ui-menu-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.errorPages}
                  onChange={() => onOptionChange('errorPages')}
                  disabled={optionsDisabled}
                />
                <span>Error pages</span>
              </label>
              <label className={`layers-panel-item ui-menu-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.duplicates}
                  onChange={() => onOptionChange('duplicates')}
                  disabled={optionsDisabled}
                />
                <span>Duplicates</span>
              </label>
              <label className={`layers-panel-item ui-menu-item${optionsDisabled ? ' disabled' : ''}`}>
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
                  {TESTER_NOT_READY_MESSAGE}
                </div>
              )}

              <MenuSectionHeader className="layers-panel-section">Type</MenuSectionHeader>
              <label className={`layers-panel-item ui-menu-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.files}
                  onChange={() => onOptionChange('files')}
                  disabled={optionsDisabled}
                />
                <span>Files / Downloads</span>
              </label>
              <MenuSectionHeader className="layers-panel-section">Connections</MenuSectionHeader>
              <label className={`layers-panel-item ui-menu-item${optionsDisabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={options.brokenLinks}
                  onChange={() => onOptionChange('brokenLinks')}
                  disabled={optionsDisabled}
                />
                <span>Broken links</span>
              </label>
              <label className={`layers-panel-item ui-menu-item${optionsDisabled ? ' disabled' : ''}`}>
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

      <Button
        className="scan-btn"
        onClick={onScan}
        disabled={scanDisabled}
        title={scanTitle}
        variant="primary"
        size="sm"
      >
        {scanLabel}
      </Button>
    </>
  );
};

export default ScanBar;
