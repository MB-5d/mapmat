import React from 'react';
import { X } from 'lucide-react';

import classNames from '../../utils/classNames';
import IconButton from './IconButton';
import StatusAlert, { normalizeStatusTone } from './StatusAlert';

const TOAST_TYPES = new Set(['info', 'success', 'warning', 'error', 'danger', 'loading']);

const Toast = ({
  message,
  children,
  title,
  type = 'info',
  tone,
  onDismiss,
  dismissLabel = 'Dismiss notification',
  action,
  className,
  ...props
}) => {
  const resolvedType = TOAST_TYPES.has(type) ? type : 'info';
  const resolvedTone = tone || normalizeStatusTone(resolvedType);
  const content = children ?? message;
  const actions = (
    <>
      {action}
      {onDismiss ? (
        <IconButton
          className="toast-close"
          type="ghost"
          buttonStyle="mono"
          size="sm"
          icon={<X />}
          label={dismissLabel}
          onClick={onDismiss}
        />
      ) : null}
    </>
  );

  return (
    <StatusAlert
      className={classNames('toast', `toast-${resolvedType}`, className)}
      tone={resolvedType === 'loading' ? 'loading' : resolvedTone}
      iconSize={18}
      title={title}
      role={resolvedTone === 'danger' || resolvedTone === 'warning' ? 'alert' : 'status'}
      actions={action || onDismiss ? actions : null}
      {...props}
    >
      {content}
    </StatusAlert>
  );
};

export default Toast;
