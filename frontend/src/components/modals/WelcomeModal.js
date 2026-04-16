import React, { useEffect } from 'react';

import mapmatLogo from '../../assets/MM-Logo.svg';
import Button from '../ui/Button';
import CheckboxField from '../ui/CheckboxField';
import Modal from '../ui/Modal';

const WelcomeModal = ({
  show,
  dontShowAgain,
  onToggleDontShowAgain,
  onClose,
  onConfirm,
}) => {
  useEffect(() => {
    if (!show) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, show]);

  if (!show) return null;

  return (
    <Modal
      show={show}
      onClose={onClose}
      size="md"
      scrollable
      className="welcome-modal"
      titleId="welcome-modal-title"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            OK
          </Button>
        </>
      )}
    >
      <div className="welcome-modal-logo-wrap">
        <img className="welcome-modal-logo" src={mapmatLogo} alt="Map Mat" />
      </div>

      <div className="welcome-modal-copy">
        <div className="welcome-modal-intro">
          <h2 id="welcome-modal-title">Welcome to Map Mat</h2>
          <p className="welcome-modal-lead">
            Map Mat turns a site&apos;s structure into a visual map you can scan, review, and share.
          </p>
        </div>

        <div className="welcome-modal-section">
          <h3>What this is</h3>
          <p>A visual site-mapping workspace for audits, redesign planning, and stakeholder review.</p>
        </div>

        <div className="welcome-modal-section">
          <h3>Why it&apos;s useful</h3>
          <p>It makes hierarchy, gaps, screenshots, and comments easier to review than spreadsheets or flat crawl results.</p>
        </div>

        <div className="welcome-modal-section">
          <h3>How it helps</h3>
          <p>Scan a public site, create a blank map, or import a sitemap/file, then organize pages and export what you need.</p>
        </div>
      </div>

      <CheckboxField
        className="welcome-modal-checkbox"
        checked={dontShowAgain}
        onChange={onToggleDontShowAgain}
        label="Don't show this again on this browser"
      />
    </Modal>
  );
};

export default WelcomeModal;
