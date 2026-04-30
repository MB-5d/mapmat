import React, { useEffect, useState } from 'react';

import { useConsent } from '../../contexts/ConsentContext';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import ToggleSwitch from '../ui/ToggleSwitch';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const ConsentSettingsModal = () => {
  const {
    consent,
    isSettingsOpen,
    closeSettings,
    acceptResearch,
    rejectOptional,
    saveChoices,
  } = useConsent();
  const [analytics, setAnalytics] = useState(consent.analytics);
  const [experienceResearch, setExperienceResearch] = useState(consent.experienceResearch);

  useEffect(() => {
    if (!isSettingsOpen) return;
    setAnalytics(consent.analytics);
    setExperienceResearch(consent.experienceResearch);
  }, [consent.analytics, consent.experienceResearch, isSettingsOpen]);

  useEffect(() => {
    if (!isSettingsOpen) return undefined;

    const modal = document.querySelector('.consent-settings-modal');
    const focusable = Array.from(modal?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
    focusable[0]?.focus();

    const handleKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      const activeModal = document.querySelector('.consent-settings-modal');
      const elements = Array.from(activeModal?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen]);

  const handleAccept = () => {
    acceptResearch();
    closeSettings();
  };

  const handleReject = () => {
    rejectOptional();
    closeSettings();
  };

  const handleSave = () => {
    saveChoices({ analytics, experienceResearch });
    closeSettings();
  };

  return (
    <Modal
      show={isSettingsOpen}
      onClose={closeSettings}
      title="Privacy Settings"
      subtitle="Choose optional product research tools for Vellic."
      size="md"
      scrollable
      className="consent-settings-modal"
      bodyClassName="consent-settings-modal__body"
      footer={(
        <div className="consent-settings-modal__actions">
          <Button variant="secondary" type="secondary" buttonStyle="mono" onClick={handleReject}>
            Reject all optional
          </Button>
          <Button variant="secondary" type="secondary" buttonStyle="mono" onClick={handleAccept}>
            Accept research cookies
          </Button>
          <Button onClick={handleSave}>
            Save choices
          </Button>
        </div>
      )}
    >
      <div className="consent-settings-modal__content">
        <ToggleSwitch
          className="consent-toggle-row"
          checked
          disabled
          label="Necessary storage"
          description="Required. Used for login, security, preferences, core app functionality, and remembering your privacy choices. Always on."
        />
        <ToggleSwitch
          className="consent-toggle-row"
          checked={analytics}
          onChange={(event) => setAnalytics(event.target.checked)}
          label="Analytics"
          description="Optional. Helps us understand aggregate product usage so we can improve Vellic. Not used for marketing or advertising."
        />
        <ToggleSwitch
          className="consent-toggle-row"
          checked={experienceResearch}
          onChange={(event) => setExperienceResearch(event.target.checked)}
          label="Experience research"
          description="Optional. Helps us understand confusing flows, usability issues, and product bugs through session feedback tools. Not used for marketing or advertising."
        />
        <ToggleSwitch
          className="consent-toggle-row"
          checked={false}
          disabled
          label="Marketing"
          description="Not used. Vellic does not use advertising, retargeting, or marketing cookies."
        />
      </div>
    </Modal>
  );
};

export default ConsentSettingsModal;
