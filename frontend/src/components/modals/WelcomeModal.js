import React, { useEffect } from 'react';
import { FileUp, Search, Share2 } from 'lucide-react';

import Button from '../ui/Button';
import VellicLogo from '../brand/VellicLogo';
import CheckboxField from '../ui/CheckboxField';
import Modal from '../ui/Modal';
import { APP_BRAND_NAME } from '../../utils/constants';

const WELCOME_STEPS = [
  {
    icon: Search,
    title: 'Scan a URL',
    copy: 'Turn a live site into a map you can review.',
  },
  {
    icon: FileUp,
    title: 'Import or create',
    copy: 'Bring in sitemap files or build a map from scratch.',
  },
  {
    icon: Share2,
    title: 'Review and share',
    copy: 'Use screenshots, notes, and saved maps to align the team.',
  },
];

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
      title={<VellicLogo className="welcome-modal-logo" title={APP_BRAND_NAME} />}
      titleId="welcome-modal-title"
      closeLabel="Close welcome modal"
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
            <Button variant="primary" onClick={onConfirm}>
              Okay
            </Button>
          </div>
        </div>
      )}
    >
      <div className="welcome-modal-copy">
        <p className="welcome-modal-lead">
          Vellic turns site structure into a shared map for planning and auditing
          IA, content, UX, product, and development.
        </p>
        <ul className="welcome-modal-steps" aria-label="Ways to start">
          {WELCOME_STEPS.map(({ icon: StepIcon, title, copy }) => (
            <li className="welcome-modal-step" key={title}>
              <span className="welcome-modal-step-icon" aria-hidden="true">
                <StepIcon size={24} strokeWidth={2} />
              </span>
              <span className="welcome-modal-step-copy">
                <strong>{title}</strong>
                <span>{copy}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
};

export default WelcomeModal;
