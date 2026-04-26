import React from 'react';

import classNames from '../../utils/classNames';
import Field from './Field';
import Icon from './Icon';
import { resolveInputModel } from './inputModel';

const TextInput = React.forwardRef(
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
      rightIcon = null,
      fieldClassName,
      shellClassName,
      inputClassName,
      className,
      id,
      name,
      disabled = false,
      framed = true,
      ...props
    },
    ref
  ) => {
    const resolvedInput = resolveInputModel({ size, inputStyle });
    const isInvalid = invalid || Boolean(error);
    const inputId = id || name;
    const shouldWrapField = Boolean(label || hint || error || required || labelHidden || fieldClassName);

    const input = (
      <input
        ref={ref}
        id={inputId}
        name={name}
        disabled={disabled}
        aria-invalid={isInvalid ? 'true' : undefined}
        className={classNames(
          'ui-input',
          `ui-input--${resolvedInput.size}`,
          `ui-input--style-${resolvedInput.inputStyle}`,
          isInvalid && 'ui-input--invalid',
          className,
          inputClassName
        )}
        {...props}
      />
    );

    const control = framed ? (
      <span
        className={classNames(
          'ui-input-shell',
          `ui-input-shell--${resolvedInput.size}`,
          `ui-input-shell--style-${resolvedInput.inputStyle}`,
          isInvalid && 'ui-input-shell--invalid',
          disabled && 'ui-input-shell--disabled',
          leftIcon && 'ui-input-shell--with-left-icon',
          rightIcon && 'ui-input-shell--with-right-icon',
          className,
          shellClassName
        )}
      >
        {leftIcon ? (
          <Icon icon={leftIcon} size={resolvedInput.size} className="ui-input-shell__icon ui-input-shell__icon--left" />
        ) : null}
        {input}
        {rightIcon ? (
          <Icon icon={rightIcon} size={resolvedInput.size} className="ui-input-shell__icon ui-input-shell__icon--right" />
        ) : null}
      </span>
    ) : input;

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

TextInput.displayName = 'TextInput';

export default TextInput;
