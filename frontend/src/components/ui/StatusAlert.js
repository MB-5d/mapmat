import React from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  XCircle,
} from 'lucide-react';

import classNames from '../../utils/classNames';
import Icon from './Icon';

const STATUS_ICON = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  danger: XCircle,
  error: XCircle,
  loading: Loader2,
};

export const normalizeStatusTone = (tone = 'info') => {
  if (tone === 'error') return 'danger';
  if (tone === 'loading') return 'info';
  return tone;
};

export const StatusIcon = ({
  tone = 'info',
  size = 16,
  className,
  ...props
}) => {
  const iconTone = normalizeStatusTone(tone);
  const IconComponent = STATUS_ICON[tone] || STATUS_ICON[iconTone] || STATUS_ICON.info;

  return (
    <Icon
      icon={<IconComponent />}
      size={size}
      className={classNames(
        'ui-status-alert__icon',
        tone === 'loading' && 'ui-status-alert__spinner',
        className
      )}
      {...props}
    />
  );
};

const StatusAlert = React.forwardRef(
  (
    {
      tone = 'info',
      icon,
      iconSize = 16,
      title,
      children,
      actions,
      className,
      contentClassName,
      summaryClassName,
      role,
      ...props
    },
    ref
  ) => {
    const normalizedTone = normalizeStatusTone(tone);
    const resolvedRole = role || (normalizedTone === 'danger' || normalizedTone === 'warning' ? 'alert' : 'status');
    const iconNode = icon === false
      ? null
      : icon
        ? <Icon icon={icon} size={iconSize} className="ui-status-alert__icon" />
        : <StatusIcon tone={tone} size={iconSize} />;

    return (
      <div
        ref={ref}
        className={classNames(
          'ui-status-alert',
          `ui-status-alert--${normalizedTone}`,
          className
        )}
        role={resolvedRole}
        {...props}
      >
        {iconNode}
        <div className={classNames('ui-status-alert__content', contentClassName)}>
          {title ? <strong className="ui-status-alert__title">{title}</strong> : null}
          {typeof children === 'string' || typeof children === 'number' ? (
            <span className={classNames('ui-status-alert__summary', summaryClassName)}>
              {children}
            </span>
          ) : children}
        </div>
        {actions ? <div className="ui-status-alert__actions">{actions}</div> : null}
      </div>
    );
  }
);

StatusAlert.displayName = 'StatusAlert';

export default StatusAlert;
