import React, { useCallback, useState } from 'react';

import {
  createAcceptedResearchConsent,
  useConsent,
  writeStoredConsent,
} from '../../contexts/ConsentContext';
import Button from '../ui/Button';

const ConsentDrawer = ({ show = true, translateText = (source) => source }) => {
  const t = translateText;
  const {
    needsConsent,
    isSettingsOpen,
    acceptResearch,
    openSettings,
  } = useConsent();
  const [acceptedLocally, setAcceptedLocally] = useState(false);

  const handleAccept = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    let acceptedConsent = null;
    try {
      acceptedConsent = writeStoredConsent(createAcceptedResearchConsent());
    } catch (error) {
      acceptedConsent = null;
    }

    acceptedConsent = acceptResearch() || acceptedConsent;
    setAcceptedLocally(true);

    if (typeof document !== 'undefined') {
      document
        .querySelectorAll('.consent-drawer')
        .forEach((drawer) => drawer.setAttribute('hidden', ''));
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vellic:consent-updated', {
        detail: acceptedConsent,
      }));
    }
  }, [acceptResearch]);

  if (!show || !needsConsent || acceptedLocally) return null;

  return (
    <aside className={`consent-drawer${isSettingsOpen ? ' consent-drawer--settings-open' : ''}`} aria-labelledby="consent-drawer-title">
      <div className="consent-drawer__copy">
        <h2 id="consent-drawer-title">{t('Help us improve Vellic')}</h2>
        <p>
          {t('We use necessary storage to keep Vellic working. With your permission, we also use analytics and session feedback tools to understand what is useful, confusing, or broken to improve the site and app for you. We do not use these cookies for marketing, advertising, retargeting, or selling personal data.')}
        </p>
      </div>
      <div className="consent-drawer__actions">
        <Button size="sm" variant="secondary" type="secondary" buttonStyle="brand" htmlType="button" data-consent-action="open-settings" onClick={openSettings}>
          {t('Cookie settings')}
        </Button>
        <button
          type="button"
          className="ui-btn ui-btn--type-primary ui-btn--style-brand ui-btn--sm"
          data-consent-action="accept-research"
          onPointerDownCapture={handleAccept}
          onMouseDownCapture={handleAccept}
          onTouchStartCapture={handleAccept}
          onClick={handleAccept}
        >
          <span className="ui-btn__content">{t('Accept cookies')}</span>
        </button>
      </div>
    </aside>
  );
};

export default ConsentDrawer;
