import React from 'react';

import classNames from '../../utils/classNames';

export const MenuPanel = React.forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} className={classNames('ui-menu-panel', className)} {...props}>
    {children}
  </div>
));

MenuPanel.displayName = 'MenuPanel';

export const MenuSectionHeader = ({ className, children, ...props }) => (
  <div className={classNames('ui-menu-section-header', className)} {...props}>
    {children}
  </div>
);

export const MenuDivider = ({ className, ...props }) => (
  <div className={classNames('ui-menu-divider', className)} role="separator" {...props} />
);

export const MenuItem = React.forwardRef(
  (
    {
      as: Component = 'button',
      className,
      icon = null,
      label,
      description,
      badge = null,
      endSlot = null,
      selected = false,
      danger = false,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => (
    <Component
      ref={ref}
      className={classNames(
        'ui-menu-item',
        selected && 'ui-menu-item--selected',
        danger && 'ui-menu-item--danger',
        className
      )}
      type={Component === 'button' ? type : undefined}
      {...props}
    >
      {icon ? (
        <span className="ui-menu-item__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="ui-menu-item__content">
        {label != null ? <span className="ui-menu-item__label">{label}</span> : null}
        {description ? <span className="ui-menu-item__description">{description}</span> : null}
        {children}
      </span>
      {badge ? <span className="ui-menu-item__badge">{badge}</span> : null}
      {endSlot ? <span className="ui-menu-item__end">{endSlot}</span> : null}
    </Component>
  )
);

MenuItem.displayName = 'MenuItem';
