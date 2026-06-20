import React from 'react';
import { RotateCcw, Scan, SlidersHorizontal } from 'lucide-react';

import Button from '../ui/Button';
import CheckboxField from '../ui/CheckboxField';
import IconButton from '../ui/IconButton';
import { MenuPanel, MenuSectionHeader } from '../ui/Menu';
import TextInput from '../ui/TextInput';
import { AUTHENTICATED_SCAN_ENABLED } from '../../utils/constants';
import Icon from '../ui/Icon';

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
  onScan,
  scanLabel = 'Scan',
  scanDisabled,
  scanTitle,
  controlsDisabled = false,
  placeholder = 'https://example.com',
  sharedTitle,
  optionsDisabled,
  onClearUrl,
  showClearUrl,
}) => {
  const inputPlaceholder = placeholder || 'https://example.com';

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
        onBlur={(e) => { if (!urlInput) e.target.placeholder = inputPlaceholder; }}
        placeholder={inputPlaceholder}
        spellCheck={false}
        disabled={controlsDisabled}
      />
      {showClearUrl && (
        <IconButton
          className="scan-clear-btn"
          size="xxs"
          variant="ghost"
          icon={<RotateCcw size={16} />}
          label="Clear URL"
          type="button"
          onClick={onClearUrl}
          title="Clear URL"
          disabled={controlsDisabled}
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
          disabled={controlsDisabled}
        >
          Options
        </Button>
        {showOptions && (
          <MenuPanel className="layers-panel">
            <div className="layers-panel-list">
              <div className="scan-options-group">
                <MenuSectionHeader className="layers-panel-section">Placement</MenuSectionHeader>
                <CheckboxField
                  className="layers-panel-item scan-options-checkbox"
                  checked={options.subdomains}
                  onChange={() => onOptionChange('subdomains')}
                  disabled={controlsDisabled || optionsDisabled}
                  label="Subdomains"
                />
                <CheckboxField
                  className="layers-panel-item scan-options-checkbox"
                  checked={options.orphanPages}
                  onChange={() => onOptionChange('orphanPages')}
                  disabled={controlsDisabled || optionsDisabled}
          label="Orphan pages"
                />
              </div>
              <div className="scan-options-group">
                <MenuSectionHeader className="layers-panel-section">Status</MenuSectionHeader>
                <CheckboxField
                  className="layers-panel-item scan-options-checkbox"
                  checked={options.inactivePages}
                  onChange={() => onOptionChange('inactivePages')}
                  disabled={controlsDisabled || optionsDisabled}
                  label="Inactive pages"
                />
                <CheckboxField
                  className="layers-panel-item scan-options-checkbox"
                  checked={options.errorPages}
                  onChange={() => onOptionChange('errorPages')}
                  disabled={controlsDisabled || optionsDisabled}
                  label="Error pages"
                />
                <CheckboxField
                  className="layers-panel-item scan-options-checkbox"
                  checked={options.duplicates}
                  onChange={() => onOptionChange('duplicates')}
                  disabled={controlsDisabled || optionsDisabled}
                  label="Duplicates"
                />
                {AUTHENTICATED_SCAN_ENABLED ? (
                  <CheckboxField
                    className="layers-panel-item scan-options-checkbox"
                    checked={options.authenticatedPages}
                    onChange={() => onOptionChange('authenticatedPages')}
                    disabled={controlsDisabled || optionsDisabled}
                    label="Authenticated pages"
                  />
                ) : null}
              </div>
              <div className="scan-options-group">
                <MenuSectionHeader className="layers-panel-section">Type</MenuSectionHeader>
                <CheckboxField
                  className="layers-panel-item scan-options-checkbox"
                  checked={options.files}
                  onChange={() => onOptionChange('files')}
                  disabled={controlsDisabled || optionsDisabled}
                  label="Files / downloads"
                />
              </div>
              <div className="scan-options-group">
                <MenuSectionHeader className="layers-panel-section">Connections</MenuSectionHeader>
                <CheckboxField
                  className="layers-panel-item scan-options-checkbox"
                  checked={options.brokenLinks}
                  onChange={() => onOptionChange('brokenLinks')}
                  disabled={controlsDisabled || optionsDisabled}
                  label="Broken links"
                />
                <CheckboxField
                  className="layers-panel-item scan-options-checkbox"
                  checked={options.crosslinks}
                  onChange={() => onOptionChange('crosslinks')}
                  disabled={controlsDisabled || optionsDisabled}
                  label="Crosslinks"
                />
              </div>
            </div>
          </MenuPanel>
        )}
      </div>

      <Button
        className="scan-btn"
        onClick={onScan}
        disabled={scanDisabled || controlsDisabled}
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
