import React from 'react';

import { useConsent } from '../../contexts/ConsentContext';
import Button from '../ui/Button';

const ConsentDrawer = ({ show = true, translateText = (source) => source }) => {
  const t = translateText;
  const {
    needsConsent,
    acceptResearch,
    openSettings,
  } = useConsent();

  if (!show || !needsConsent) return null;

  return (
    <aside className="consent-drawer" aria-labelledby="consent-drawer-title">
      <div className="consent-drawer__copy">
        <h2 id="consent-drawer-title">{t('Help us improve Vellic')}</h2>
        <p>
          {t('We use necessary storage to keep Vellic working. With your permission, we also use analytics and session feedback tools to understand what is useful, confusing, or broken to improve the site and app for you. We do not use these cookies for marketing, advertising, retargeting, or selling personal data.')}
        </p>
      </div>
      <div className="consent-drawer__actions">
        <Button size="sm" htmlType="button" onClick={acceptResearch}>
          {t('Accept cookies')}
        </Button>
        <Button size="sm" variant="secondary" type="secondary" buttonStyle="brand" htmlType="button" onClick={openSettings}>
          {t('Cookie settings')}
        </Button>
      </div>
    </aside>
  );
};

export default ConsentDrawer;
