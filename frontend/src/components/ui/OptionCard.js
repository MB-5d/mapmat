import React from 'react';

import classNames from '../../utils/classNames';

const OptionCard = React.forwardRef(
  (
    {
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
    <button
      ref={ref}
      type={type}
      className={classNames('ui-option-card', className)}
      {...props}
    >
      {icon ? <span className="ui-option-card__icon">{icon}</span> : null}
      <span className="ui-option-card__content">
        <span className="ui-option-card__title">{title}</span>
        {description ? <span className="ui-option-card__description">{description}</span> : null}
      </span>
      {badge ? <span className="ui-option-card__badge">{badge}</span> : null}
      {children}
    </button>
  )
);

OptionCard.displayName = 'OptionCard';

export default OptionCard;
