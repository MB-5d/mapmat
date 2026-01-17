import React from 'react';

import classNames from '../../utils/classNames';

const IconButton = React.forwardRef(
  (
    {
      variant = 'default',
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
      className={classNames(
        'ui-icon-btn',
        `ui-icon-btn--${size}`,
        variant !== 'default' && `ui-icon-btn--${variant}`,
        className
      )}
      {...props}
    />
  )
);

IconButton.displayName = 'IconButton';

export default IconButton;
