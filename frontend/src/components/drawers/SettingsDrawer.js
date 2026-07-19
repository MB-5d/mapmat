import React from 'react';
import { ArrowDownFromLine, ArrowRightFromLine, Languages, Sun, Moon, Monitor } from 'lucide-react';

import AccountDrawer from './AccountDrawer';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import ToggleSwitch from '../ui/ToggleSwitch';
import { useLocale } from '../../contexts/LocaleContext';

const SettingsDrawer = ({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  mapOrientation = 'vertical',
  onMapOrientationChange,
  showPageNumbers,
  onTogglePageNumbers,
  consent,
  onOpenPrivacySettings,
  onLocaleChange,
}) => {
  const { locale, localeOptions, setLocale, t } = useLocale();
  const themeOptions = [
    { value: 'auto', label: t('Auto'), icon: <Monitor size={14} /> },
    { value: 'light', label: t('Light'), icon: <Sun size={14} /> },
    { value: 'dark', label: t('Dark'), icon: <Moon size={14} /> },
  ];
  const orientationOptions = [
    { value: 'vertical', label: t('Vertical'), icon: <ArrowDownFromLine size={14} /> },
    { value: 'horizontal', label: t('Horizontal'), icon: <ArrowRightFromLine size={14} /> },
  ];
  const optionalConsentLabel = consent?.analytics || consent?.experienceResearch
    ? t('Some optional research tools are allowed.')
    : t('Optional research tools are off.');

  return (
    <AccountDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={t('Settings')}
      subtitle={t('Personalize your workspace')}
      className="settings-drawer"
    >
      <section className="drawer-card">
        <div className="drawer-card-title">{t('Appearance')}</div>
        <SegmentedControl
          className="settings-segment"
          variant="grid"
          fullWidth
          ariaLabel={t('Theme')}
          value={theme}
          onChange={onThemeChange}
          options={themeOptions}
        />
        <div className="drawer-helper">{t('Auto follows your system preference.')}</div>
      </section>

      <section className="drawer-card">
        <div className="drawer-card-title">{t('Language')}</div>
        <SegmentedControl
          className="settings-segment"
          variant="grid"
          fullWidth
          ariaLabel={t('Language preference')}
          value={locale}
          onChange={onLocaleChange || setLocale}
          options={localeOptions.map((option) => ({
            value: option.code,
            label: option.label,
            icon: <Languages size={14} />,
          }))}
        />
        <div className="drawer-helper">
          {t('Your selection is saved to this browser and your account when signed in.')}
        </div>
      </section>

      <section className="drawer-card">
        <div className="drawer-card-title">{t('Canvas')}</div>
        <div className="field">
          <div className="field-label">{t('Map orientation')}</div>
          <SegmentedControl
            className="settings-segment"
            variant="grid"
            fullWidth
            ariaLabel={t('Map orientation')}
            value={mapOrientation}
            onChange={onMapOrientationChange}
            options={orientationOptions}
          />
        </div>
        <ToggleSwitch
          className="settings-toggle-row"
          checked={showPageNumbers}
          onChange={() => onTogglePageNumbers?.()}
          label={t('Show page numbers')}
          description={t('Keep numbering visible in every view.')}
        />
      </section>

      <section className="drawer-card">
        <div className="drawer-card-title">{t('Cookie consent')}</div>
        <div className="drawer-helper">
          {optionalConsentLabel}
        </div>
        <div className="drawer-card-actions">
          <Button variant="secondary" type="secondary" buttonStyle="mono" onClick={onOpenPrivacySettings}>
            {t('Cookie consent settings')}
          </Button>
        </div>
      </section>
    </AccountDrawer>
  );
};

export default SettingsDrawer;
