import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const AccountDrawer = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  actions,
  className = '',
  ariaLabel,
  bodyRef,
  onBodyScroll,
  children,
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      return;
    }
    if (shouldRender) {
      setIsClosing(true);
      const timeout = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [isOpen, shouldRender]);

  if (!shouldRender) return null;

  return (
    <aside
      className={`account-drawer ${className} ${isClosing ? 'account-drawer-closing' : 'account-drawer-open'}`}
      role="dialog"
      aria-label={ariaLabel || title}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => {
        e.stopPropagation();
        e.nativeEvent?.stopImmediatePropagation?.();
      }}
      onWheelCapture={(e) => {
        e.stopPropagation();
        e.nativeEvent?.stopImmediatePropagation?.();
      }}
    >
      <header className="account-drawer-header">
        <div className="account-drawer-title">
          {icon ? <div className="account-drawer-icon">{icon}</div> : null}
          <div className="account-drawer-heading">
            <div className="account-drawer-heading-title">{title}</div>
            {subtitle ? (
              <div className="account-drawer-heading-subtitle">{subtitle}</div>
            ) : null}
          </div>
        </div>
        <div className="account-drawer-actions">
          {actions}
          <button
            type="button"
            className="account-drawer-close"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <X size={20} />
          </button>
        </div>
      </header>

      <div className="account-drawer-body" ref={bodyRef} onScroll={onBodyScroll}>
        {children}
      </div>
    </aside>
  );
};

export default AccountDrawer;
