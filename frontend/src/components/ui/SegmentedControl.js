import React from 'react';

import classNames from '../../utils/classNames';

const SegmentedControl = ({
  value,
  onChange,
  options = [],
  variant = 'pill',
  size = 'md',
  className,
  optionClassName,
  ariaLabel,
  fullWidth = false,
  optionRole,
  role,
}) => (
  <div
    className={classNames(
      'ui-segmented-control',
      `ui-segmented-control--${variant}`,
      `ui-segmented-control--${size}`,
      fullWidth && 'is-full-width',
      className
    )}
    role={role || (optionRole === 'tab' ? 'tablist' : 'group')}
    aria-label={ariaLabel}
  >
    {options.map((option) => {
      const isActive = option.value === value;

      return (
        <button
          key={option.value}
          type="button"
          role={optionRole}
          className={classNames(
            'ui-segmented-control__option',
            isActive && 'is-active',
            option.disabled && 'is-disabled',
            optionClassName
          )}
          onClick={() => onChange?.(option.value)}
          disabled={option.disabled}
          aria-pressed={optionRole ? undefined : isActive}
          aria-selected={optionRole === 'tab' ? isActive : undefined}
          tabIndex={optionRole === 'tab' && !isActive ? -1 : undefined}
        >
          {option.icon ? (
            <span className="ui-segmented-control__icon" aria-hidden="true">
              {option.icon}
            </span>
          ) : null}
          <span className="ui-segmented-control__label">{option.label}</span>
        </button>
      );
    })}
  </div>
);

export default SegmentedControl;
