import React from 'react';

import { useConsent } from '../../contexts/ConsentContext';
import Button from '../ui/Button';

const ConsentDrawer = ({ show = true }) => {
  const {
    needsConsent,
    acceptResearch,
    openSettings,
  } = useConsent();

  if (!show || !needsConsent) return null;

  return (
    <aside className="consent-drawer" aria-labelledby="consent-drawer-title">
      <div className="consent-drawer__copy">
        <h2 id="consent-drawer-title">Help us improve Vellic</h2>
        <p>
          We use necessary storage to keep Vellic working. With your permission, we also use analytics and session feedback tools to understand what is useful, confusing, or broken to improve the site and app for you. We do not use these cookies for marketing, advertising, retargeting, or selling personal data.
        </p>
      </div>
      <div className="consent-drawer__actions">
        <Button size="sm" onClick={acceptResearch}>
          Accept Cookies
        </Button>
        <Button size="sm" variant="secondary" type="secondary" buttonStyle="brand" onClick={openSettings}>
          Cookie settings
        </Button>
      </div>
    </aside>
  );
};

export default ConsentDrawer;
