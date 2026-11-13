import React, { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';

import classNames from '../../utils/classNames';
import IconButton from './IconButton';

const Modal = ({
  show,
  onClose,
  title,
  subtitle = '',
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
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const resolvedTitleId = useMemo(
    () => titleId || `modal-${String(title || 'dialog').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    [title, titleId]
  );

  useEffect(() => {
    if (!show) return undefined;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const isTopDialog = () => [...document.querySelectorAll('[aria-modal="true"]')].at(-1) === dialog;
    const focusable = () => [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter((element) => !element.disabled && element.tabIndex >= 0 && !element.closest('[hidden], [inert]')
        && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
    const focusFirst = () => (dialog.querySelector('[autofocus]') || focusable()[0] || dialog).focus();
    if (!dialog.contains(document.activeElement)) focusFirst();
    const handleFocus = (event) => {
      if (isTopDialog() && !dialog.contains(event.target)) focusFirst();
    };
    const handleKeyDown = (event) => {
      if (!isTopDialog()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
      }
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (!first || !dialog.contains(document.activeElement)
          || (event.shiftKey && (document.activeElement === first || document.activeElement === dialog))
          || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last || dialog : first || dialog).focus();
        }
      }
    };
    document.addEventListener('focusin', handleFocus);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('focusin', handleFocus);
      window.removeEventListener('keydown', handleKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [show]);

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
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? resolvedTitleId : undefined}
      >
        {title || subtitle || !hideCloseButton ? (
          <div className="modal-header">
            {title || subtitle ? (
              <div className="modal-header-copy">
                {title ? <h3 id={resolvedTitleId}>{title}</h3> : null}
                {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
              </div>
            ) : <div />}
            {!hideCloseButton ? (
              <IconButton
                htmlType="button"
                className="modal-close"
                size="sm"
                variant="ghost"
                icon={<X />}
                label={closeLabel}
                onClick={onClose}
              />
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
