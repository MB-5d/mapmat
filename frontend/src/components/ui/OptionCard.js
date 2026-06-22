import React from 'react';

import classNames from '../../utils/classNames';
import Icon from './Icon';

const OptionCard = React.forwardRef(
  (
    {
      as: Component = 'button',
      title,
      description = '',
      icon,
      badge = null,
      className,
      type = 'button',
      children,
      ...props
    },
    ref
  ) => (
    <Component
      ref={ref}
      {...(Component === 'button' ? { type } : {})}
      className={classNames('ui-option-card', className)}
      {...props}
    >
      {icon ? <Icon icon={icon} size="lg" className="ui-option-card__icon" /> : null}
      <span className="ui-option-card__content">
        <span className="ui-option-card__title">{title}</span>
        {description ? <span className="ui-option-card__description">{description}</span> : null}
        {children ? <span className="ui-option-card__children">{children}</span> : null}
      </span>
      {badge ? <span className="ui-option-card__badge">{badge}</span> : null}
    </Component>
  )
);

OptionCard.displayName = 'OptionCard';

export default OptionCard;
