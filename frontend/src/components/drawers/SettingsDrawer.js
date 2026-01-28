import React from 'react';
import { Sliders, Sun, Moon, Monitor } from 'lucide-react';

import AccountDrawer from './AccountDrawer';

const SettingsDrawer = ({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  showThumbnails,
  onToggleThumbnails,
  showPageNumbers,
  onTogglePageNumbers,
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
      icon={<Sliders size={18} />}
      className="settings-drawer"
    >
      <section className="drawer-card">
        <div className="drawer-card-title">Appearance</div>
        <div className="settings-segment">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`settings-segment-option ${theme === option.value ? 'active' : ''}`}
              onClick={() => onThemeChange?.(option.value)}
              aria-pressed={theme === option.value}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
        <div className="drawer-helper">Auto follows your system preference.</div>
      </section>

      <section className="drawer-card">
        <div className="drawer-card-title">Canvas</div>
        <label className="settings-toggle-row">
          <span className="settings-toggle-text">
            <span className="settings-toggle-title">Show thumbnails</span>
            <span className="settings-toggle-subtitle">Display page previews on each node.</span>
          </span>
          <input
            type="checkbox"
            className="settings-switch"
            checked={showThumbnails}
            onChange={() => onToggleThumbnails?.()}
          />
        </label>
        <label className="settings-toggle-row">
          <span className="settings-toggle-text">
            <span className="settings-toggle-title">Show page numbers</span>
            <span className="settings-toggle-subtitle">Keep numbering visible in every view.</span>
          </span>
          <input
            type="checkbox"
            className="settings-switch"
            checked={showPageNumbers}
            onChange={() => onTogglePageNumbers?.()}
          />
        </label>
      </section>
    </AccountDrawer>
  );
};

export default SettingsDrawer;
