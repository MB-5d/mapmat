import React from 'react';
import { Loader2 } from 'lucide-react';

import classNames from '../../utils/classNames';
import Icon from './Icon';
import { resolveButtonModel } from './buttonModel';

const SPINNER_SIZE = {
  sm: 14,
  md: 16,
  lg: 18,
};

const Button = React.forwardRef(
  (
    {
      variant = 'primary',
      size = 'md',
      type,
      style,
      buttonStyle,
      htmlType,
      loading = false,
      startIcon = null,
      endIcon = null,
      iconOnly = false,
      label,
      className,
      disabled,
      children,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const content = label ?? children;
    const resolvedAriaLabel = ariaLabel || (typeof label === 'string' ? label : undefined);
    const styleProp = buttonStyle ?? style;
    const visualStyle = typeof styleProp === 'string' ? styleProp : undefined;
    const inlineStyle = style && typeof style === 'object' ? style : undefined;
    const resolvedButton = resolveButtonModel({
      type,
      style: visualStyle,
      htmlType,
      variant,
      size,
    });

    return (
      <button
        ref={ref}
        type={resolvedButton.nativeType}
        className={classNames(
          'ui-btn',
          `ui-btn--type-${resolvedButton.visual.type}`,
          `ui-btn--style-${resolvedButton.visual.style}`,
          `ui-btn--${resolvedButton.size}`,
          resolvedButton.legacyVariantClass && `ui-btn--${resolvedButton.legacyVariantClass}`,
          loading && 'ui-btn--loading',
          iconOnly && 'ui-btn--icon-only',
          className
        )}
        disabled={disabled || loading}
        aria-busy={loading ? 'true' : undefined}
        aria-label={resolvedAriaLabel}
        style={inlineStyle}
        {...props}
      >
        {loading ? (
          <Loader2 size={SPINNER_SIZE[size] || SPINNER_SIZE.md} className="ui-btn__spinner" aria-hidden="true" />
        ) : startIcon ? (
          <Icon icon={startIcon} size={size} className="ui-btn__icon ui-btn__icon--start" />
        ) : null}
        {content != null ? <span className="ui-btn__content">{content}</span> : null}
        {!loading && endIcon ? (
          <Icon icon={endIcon} size={size} className="ui-btn__icon ui-btn__icon--end" />
        ) : null}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
