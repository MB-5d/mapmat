import React from 'react';

import classNames from '../../utils/classNames';
import Icon from './Icon';
import { isUiToneStyle } from './toneStyles';

const CHIP_VARIANTS = new Set(['filter', 'metric']);
const CHIP_TONES = new Set(['brand', 'mono']);

const isValidTone = (tone) => CHIP_TONES.has(tone) || isUiToneStyle(tone);

const Chip = React.forwardRef(
  (
    {
      as,
      variant = 'filter',
      tone = 'mono',
      label = '',
      value = null,
      selected = false,
      disabled = false,
      interactive = false,
      icon = null,
      startIcon = null,
      endIcon = null,
      labelClassName,
      valueClassName,
      className,
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    const resolvedVariant = CHIP_VARIANTS.has(variant) ? variant : 'filter';
    const resolvedTone = isValidTone(tone) ? tone : 'mono';
    const isInteractive = Boolean(interactive || onClick);
    const Component = as || (isInteractive ? 'button' : 'span');
    const leadingIcon = startIcon ?? icon;
    const componentProps = {
      ...props,
      ...(Component === 'button' ? { type: props.type || 'button', disabled } : { 'aria-disabled': disabled || undefined }),
      ...(isInteractive && props['aria-pressed'] == null ? { 'aria-pressed': Boolean(selected) } : null),
      onClick,
    };

    return (
      <Component
        ref={ref}
        className={classNames(
          'ui-chip',
          `ui-chip--variant-${resolvedVariant}`,
          `ui-chip--tone-${resolvedTone}`,
          isUiToneStyle(resolvedTone) && `ui-tone--${resolvedTone}`,
          isInteractive && 'ui-chip--interactive',
          selected && 'ui-chip--selected',
          disabled && 'ui-chip--disabled',
          className
        )}
        {...componentProps}
      >
        {leadingIcon ? <Icon icon={leadingIcon} size="sm" className="ui-chip__icon ui-chip__icon--start" /> : null}
        {children ?? (
          <>
            {label != null ? <span className={classNames('ui-chip__label', labelClassName)}>{label}</span> : null}
            {value != null ? <span className={classNames('ui-chip__value', valueClassName)}>{value}</span> : null}
          </>
        )}
        {endIcon ? <Icon icon={endIcon} size="sm" className="ui-chip__icon ui-chip__icon--end" /> : null}
      </Component>
    );
  }
);

Chip.displayName = 'Chip';

export default Chip;
