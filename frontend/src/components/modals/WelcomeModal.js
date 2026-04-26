import React, { useEffect } from 'react';

import Button from '../ui/Button';
import CheckboxField from '../ui/CheckboxField';
import Modal from '../ui/Modal';
import { APP_BRAND_NAME } from '../../utils/constants';

const WelcomeModal = ({
  show,
  dontShowAgain,
  disableDontShowAgain = false,
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
      title={`Welcome to ${APP_BRAND_NAME}`}
      size="md"
      scrollable
      className="welcome-modal"
      footer={(
        <div className="welcome-modal-footer">
          <CheckboxField
            className="welcome-modal-checkbox"
            checked={dontShowAgain}
            onChange={onToggleDontShowAgain}
            disabled={disableDontShowAgain}
            label="Don't show this again on this browser"
          />
          <div className="welcome-modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={onConfirm}>
              OK
            </Button>
          </div>
        </div>
      )}
    >
      <div className="welcome-modal-logo-wrap">
        <div className="welcome-modal-wordmark" aria-label={APP_BRAND_NAME}>
          <span className="brand-logo-mark" aria-hidden="true">V</span>
          <span>{APP_BRAND_NAME}</span>
        </div>
      </div>

      <div className="welcome-modal-copy">
        <p className="welcome-modal-lead">
          Make site or software structure visual, actionable, and easy to review
          without the mess of flat crawl data or spreadsheets.
        </p>
        <p className="welcome-modal-lead">
          Scan a site, import a sitemap, or start from scratch to spot issues,
          organize pages, make connections, and gather screenshots to get content,
          UX, product, and dev aligned faster together.
        </p>
      </div>
    </Modal>
  );
};

export default WelcomeModal;
