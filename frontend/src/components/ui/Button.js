import React from 'react';
import { Loader2 } from 'lucide-react';

import classNames from '../../utils/classNames';

const Button = React.forwardRef(
  (
    {
      variant = 'primary',
      size = 'md',
      type = 'button',
      loading = false,
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={classNames(
        'ui-btn',
        `ui-btn--${variant}`,
        `ui-btn--${size}`,
        loading && 'ui-btn--loading',
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      {...props}
    >
      {loading ? <Loader2 size={16} className="ui-btn__spinner" aria-hidden="true" /> : null}
      <span className="ui-btn__content">{children}</span>
    </button>
  )
);

Button.displayName = 'Button';

export default Button;
