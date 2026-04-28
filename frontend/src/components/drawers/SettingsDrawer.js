import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

import AccountDrawer from './AccountDrawer';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import ToggleSwitch from '../ui/ToggleSwitch';

const SettingsDrawer = ({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  showPageNumbers,
  onTogglePageNumbers,
  onOpenPrivacySettings,
}) => {
  const themeOptions = [
    { value: 'auto', label: 'Auto', icon: <Monitor size={14} /> },
    { value: 'light', label: 'Light', icon: <Sun size={14} /> },
    { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
  ];

  return (
    <AccountDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      subtitle="Personalize your workspace"
      className="settings-drawer"
    >
      <section className="drawer-card">
        <div className="drawer-card-title">Appearance</div>
        <SegmentedControl
          className="settings-segment"
          variant="grid"
          fullWidth
          ariaLabel="Theme"
          value={theme}
          onChange={onThemeChange}
          options={themeOptions}
        />
        <div className="drawer-helper">Auto follows your system preference.</div>
      </section>

      <section className="drawer-card">
        <div className="drawer-card-title">Canvas</div>
        <ToggleSwitch
          className="settings-toggle-row"
          checked={showPageNumbers}
          onChange={() => onTogglePageNumbers?.()}
          label="Show page numbers"
          description="Keep numbering visible in every view."
        />
      </section>

      <section className="drawer-card">
        <div className="drawer-card-title">Privacy</div>
        <div className="drawer-helper">
          Manage optional analytics and product research tools.
        </div>
        <div className="drawer-card-actions">
          <Button variant="secondary" type="secondary" buttonStyle="mono" onClick={onOpenPrivacySettings}>
            Privacy Settings
          </Button>
        </div>
      </section>
    </AccountDrawer>
  );
};

export default SettingsDrawer;
