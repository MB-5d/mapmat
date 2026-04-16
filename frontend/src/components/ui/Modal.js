import React, { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';

import classNames from '../../utils/classNames';

const Modal = ({
  show,
  onClose,
  title,
  size = 'md',
  scrollable = false,
  className,
  titleId,
  closeLabel = 'Close dialog',
  hideCloseButton = false,
  bodyClassName,
  footer,
  children,
}) => {
  const resolvedTitleId = useMemo(
    () => titleId || `modal-${String(title || 'dialog').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    [title, titleId]
  );

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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={classNames(
          'modal-card',
          `modal-${size}`,
          scrollable && 'modal-scrollable',
          className
        )}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? resolvedTitleId : undefined}
      >
        {title || !hideCloseButton ? (
          <div className="modal-header">
            {title ? <h3 id={resolvedTitleId}>{title}</h3> : <div />}
            {!hideCloseButton ? (
              <button type="button" className="modal-close" onClick={onClose} aria-label={closeLabel}>
                <X size={24} />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={classNames('modal-body', bodyClassName)}>{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
};

export default Modal;
