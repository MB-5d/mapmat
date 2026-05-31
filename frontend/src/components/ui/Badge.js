import React from 'react';

import classNames from '../../utils/classNames';
import Icon from './Icon';

const BADGE_TYPES = new Set(['fill', 'hollow']);
const BADGE_STYLES = new Set(['brand', 'mono', 'info', 'error', 'warning', 'success', 'neutral']);
const BADGE_SIZES = new Set(['sm', 'md']);

const Badge = React.forwardRef(
  (
    {
      as: Component = 'span',
      label = '',
      type = 'hollow',
      badgeStyle = 'brand',
      size = 'md',
      startIcon = null,
      endIcon = null,
      icon = null,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const resolvedType = BADGE_TYPES.has(type) ? type : 'hollow';
    const resolvedStyle = BADGE_STYLES.has(badgeStyle) ? badgeStyle : 'brand';
    const resolvedSize = BADGE_SIZES.has(size) ? size : 'md';
    const content = children ?? label;
    const leadingIcon = startIcon ?? icon;

    return (
      <Component
        ref={ref}
        className={classNames(
          'ui-badge',
          `ui-badge--${resolvedSize}`,
          `ui-badge--type-${resolvedType}`,
          `ui-badge--style-${resolvedStyle}`,
          className
        )}
        {...props}
      >
        {leadingIcon ? <Icon icon={leadingIcon} size="xs" className="ui-badge__icon ui-badge__icon--start" /> : null}
        {typeof content === 'string' || typeof content === 'number'
          ? <span className="ui-badge__content">{content}</span>
          : content}
        {endIcon ? <Icon icon={endIcon} size="xs" className="ui-badge__icon ui-badge__icon--end" /> : null}
      </Component>
    );
  }
);

Badge.displayName = 'Badge';

export default Badge;
