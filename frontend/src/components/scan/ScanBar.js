import React from 'react';
import { RotateCcw, Scan, SlidersHorizontal } from 'lucide-react';

import Button from '../ui/Button';
import CheckboxField from '../ui/CheckboxField';
import IconButton from '../ui/IconButton';
import { MenuPanel, MenuSectionHeader } from '../ui/Menu';
import SelectInput from '../ui/SelectInput';
import TextInput from '../ui/TextInput';
import {
  APP_ONLY_MODE,
  TESTER_NOT_READY_MESSAGE,
} from '../../utils/constants';
import Icon from '../ui/Icon';

const SCAN_DEPTH_OPTIONS = Array.from({ length: 25 }, (_, index) => index + 1);
const getScanDepthOptionLabel = (value) => `${value} ${value === 1 ? 'Level' : 'Levels'}`;

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
      <Icon icon={<Scan />} size="md" className="scan-bar__icon" />
      <TextInput
        className="scan-bar__input"
        framed={false}
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
          <MenuPanel className="layers-panel">
            <div className="layers-panel-list">
              <MenuSectionHeader className="layers-panel-section">Scan depth</MenuSectionHeader>
              <div className={`scan-options-depth-field${optionsDisabled ? ' is-disabled' : ''}`}>
                <SelectInput
                  id="scan-depth-select"
                  aria-label="Scan depth levels"
                  shellClassName="scan-options-depth-select-shell"
                  inputClassName="scan-options-depth-select-input"
                  size="sm"
                  value={scanDepth}
                  onChange={(e) => onScanDepthChange(e.target.value)}
                  disabled={optionsDisabled}
                  onClick={(e) => e.stopPropagation()}
                >
                  {SCAN_DEPTH_OPTIONS.map((value) => (
                    <option key={value} value={value}>{getScanDepthOptionLabel(value)}</option>
                  ))}
                </SelectInput>
              </div>
              <MenuSectionHeader className="layers-panel-section">Placement</MenuSectionHeader>
              <CheckboxField
                className="layers-panel-item scan-options-checkbox"
                checked={options.subdomains}
                onChange={() => onOptionChange('subdomains')}
                disabled={optionsDisabled}
                label="Subdomains"
              />
              <CheckboxField
                className="layers-panel-item scan-options-checkbox"
                checked={options.orphanPages}
                onChange={() => onOptionChange('orphanPages')}
                disabled={optionsDisabled}
                label="Orphan Pages"
              />
              <MenuSectionHeader className="layers-panel-section">Status</MenuSectionHeader>
              <CheckboxField
                className="layers-panel-item scan-options-checkbox"
                checked={options.inactivePages}
                onChange={() => onOptionChange('inactivePages')}
                disabled={optionsDisabled}
                label="Inactive pages"
              />
              <CheckboxField
                className="layers-panel-item scan-options-checkbox"
                checked={options.errorPages}
                onChange={() => onOptionChange('errorPages')}
                disabled={optionsDisabled}
                label="Error pages"
              />
              <CheckboxField
                className="layers-panel-item scan-options-checkbox"
                checked={options.duplicates}
                onChange={() => onOptionChange('duplicates')}
                disabled={optionsDisabled}
                label="Duplicates"
              />
              <CheckboxField
                className="layers-panel-item scan-options-checkbox"
                checked={options.authenticatedPages}
                onChange={() => onOptionChange('authenticatedPages')}
                disabled={optionsDisabled || APP_ONLY_MODE}
                label="Authenticated Pages"
              />
              {APP_ONLY_MODE && (
                <div className="layers-panel-hint">
                  {TESTER_NOT_READY_MESSAGE}
                </div>
              )}

              <MenuSectionHeader className="layers-panel-section">Type</MenuSectionHeader>
              <CheckboxField
                className="layers-panel-item scan-options-checkbox"
                checked={options.files}
                onChange={() => onOptionChange('files')}
                disabled={optionsDisabled}
                label="Files / Downloads"
              />
              <MenuSectionHeader className="layers-panel-section">Connections</MenuSectionHeader>
              <CheckboxField
                className="layers-panel-item scan-options-checkbox"
                checked={options.brokenLinks}
                onChange={() => onOptionChange('brokenLinks')}
                disabled={optionsDisabled}
                label="Broken links"
              />
              <CheckboxField
                className="layers-panel-item scan-options-checkbox"
                checked={options.crosslinks}
                onChange={() => onOptionChange('crosslinks')}
                disabled={optionsDisabled}
                label="Crosslinks"
              />
            </div>
          </MenuPanel>
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
