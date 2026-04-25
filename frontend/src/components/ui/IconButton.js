import React from 'react';
import { Loader2 } from 'lucide-react';

import classNames from '../../utils/classNames';
import Icon from './Icon';
import { ICON_BUTTON_SIZES, ICON_BUTTON_VARIANT_MAP, resolveButtonModel } from './buttonModel';

const ICON_BUTTON_ICON_SIZE = {
  default: {
    sm: 14,
    md: 20,
    lg: 24,
    xl: 32,
    xxl: 40,
  },
  link: {
    sm: 16,
    md: 24,
    lg: 32,
    xl: 40,
    xxl: 48,
  },
};

const IconButton = React.forwardRef(
  (
    {
      variant = 'default',
      size = 'xl',
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
      fallbackSize: 'xl',
      validSizes: ICON_BUTTON_SIZES,
      defaultVariant: 'default',
      variantMap: ICON_BUTTON_VARIANT_MAP,
    });
    const resolvedIconSize = (
      resolvedButton.visual.type === 'link'
        ? ICON_BUTTON_ICON_SIZE.link
        : ICON_BUTTON_ICON_SIZE.default
    )[resolvedButton.size] || ICON_BUTTON_ICON_SIZE.default.xl;

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
          <Loader2 size={resolvedIconSize} className="ui-icon-btn__spinner" aria-hidden="true" />
        ) : content ? (
          <Icon icon={content} size={resolvedIconSize} className="ui-icon-btn__icon" />
        ) : null}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export default IconButton;
