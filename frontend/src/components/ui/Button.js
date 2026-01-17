import React from 'react';

import classNames from '../../utils/classNames';

const Button = React.forwardRef(
  (
    {
      variant = 'primary',
      size = 'md',
      type = 'button',
      className,
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={classNames('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, className)}
      {...props}
    />
  )
);

Button.displayName = 'Button';

export default Button;
