import React from 'react';
import { ChevronDown } from 'lucide-react';

import classNames from '../../utils/classNames';
import Field from './Field';
import Icon from './Icon';
import { resolveInputModel } from './inputModel';

const SelectInput = React.forwardRef(
  (
    {
      size = 'md',
      inputStyle = 'mono',
      invalid = false,
      label,
      labelHidden = false,
      hint = '',
      error = '',
      required = false,
      leftIcon = null,
      fieldClassName,
      shellClassName,
      inputClassName,
      className,
      id,
      name,
      disabled = false,
      ...props
    },
    ref
  ) => {
    const resolvedInput = resolveInputModel({ size, inputStyle });
    const isInvalid = invalid || Boolean(error);
    const inputId = id || name;
    const shouldWrapField = Boolean(label || hint || error || required || labelHidden || fieldClassName);

    const control = (
      <span
        className={classNames(
          'ui-select-shell',
          'ui-input-shell',
          `ui-input-shell--${resolvedInput.size}`,
          `ui-input-shell--style-${resolvedInput.inputStyle}`,
          isInvalid && 'ui-input-shell--invalid',
          disabled && 'ui-input-shell--disabled',
          leftIcon && 'ui-input-shell--with-left-icon',
          className,
          shellClassName
        )}
        >
        {leftIcon ? (
          <span className="ui-input-shell__icon ui-input-shell__icon--left" aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}
        <select
          ref={ref}
          id={inputId}
          name={name}
          disabled={disabled}
          aria-invalid={isInvalid ? 'true' : undefined}
          className={classNames(
            'ui-select',
            `ui-select--${resolvedInput.size}`,
            `ui-select--style-${resolvedInput.inputStyle}`,
            isInvalid && 'ui-select--invalid',
            className,
            inputClassName
          )}
          {...props}
        />
        <Icon
          icon={<ChevronDown />}
          size={resolvedInput.size}
          className="ui-input-shell__icon ui-input-shell__icon--right ui-select-chevron"
        />
      </span>
    );

    if (!shouldWrapField) {
      return control;
    }

    return (
      <Field
        className={fieldClassName}
        label={label}
        labelHidden={labelHidden}
        htmlFor={inputId}
        required={required}
        hint={hint}
        error={error}
      >
        {control}
      </Field>
    );
  }
);

SelectInput.displayName = 'SelectInput';

export default SelectInput;
