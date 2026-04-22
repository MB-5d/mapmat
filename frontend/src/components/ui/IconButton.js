import React from 'react';
import { Loader2 } from 'lucide-react';

import classNames from '../../utils/classNames';
import { ICON_BUTTON_VARIANT_MAP, resolveButtonModel } from './buttonModel';

const SPINNER_SIZE = {
  sm: 12,
  md: 14,
  lg: 16,
};

const IconButton = React.forwardRef(
  (
    {
      variant = 'default',
      size = 'md',
      type,
      style,
      buttonStyle,
      htmlType,
      icon = null,
      label,
      loading = false,
      active = false,
      className,
      disabled,
      children,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const content = icon ?? children;
    const resolvedAriaLabel = ariaLabel || label;
    const styleProp = buttonStyle ?? style;
    const visualStyle = typeof styleProp === 'string' ? styleProp : undefined;
    const inlineStyle = style && typeof style === 'object' ? style : undefined;
    const resolvedButton = resolveButtonModel({
      type,
      style: visualStyle,
      htmlType,
      variant,
      size,
      defaultVariant: 'default',
      variantMap: ICON_BUTTON_VARIANT_MAP,
    });

    return (
      <button
        ref={ref}
        type={resolvedButton.nativeType}
        className={classNames(
          'ui-icon-btn',
          `ui-icon-btn--${resolvedButton.size}`,
          `ui-icon-btn--type-${resolvedButton.visual.type}`,
          `ui-icon-btn--style-${resolvedButton.visual.style}`,
          resolvedButton.legacyVariantClass && `ui-icon-btn--${resolvedButton.legacyVariantClass}`,
          loading && 'ui-icon-btn--loading',
          active && 'ui-icon-btn--active',
          className
        )}
        disabled={disabled || loading}
        aria-busy={loading ? 'true' : undefined}
        aria-label={resolvedAriaLabel}
        style={inlineStyle}
        {...props}
      >
        {loading ? (
          <Loader2 size={SPINNER_SIZE[size] || SPINNER_SIZE.md} className="ui-icon-btn__spinner" aria-hidden="true" />
        ) : content ? (
          <span className="ui-icon-btn__icon" aria-hidden="true">
            {content}
          </span>
        ) : null}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export default IconButton;
