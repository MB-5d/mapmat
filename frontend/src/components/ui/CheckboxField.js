import React, { useEffect, useRef } from 'react';

import classNames from '../../utils/classNames';

const CheckboxField = ({
  checked,
  onChange,
  label,
  description = '',
  disabled = false,
  indeterminate = false,
  className,
  inputClassName,
  ...props
}) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label className={classNames('ui-checkbox-field', disabled && 'is-disabled', className)}>
      <input
        {...props}
        ref={inputRef}
        type="checkbox"
        className={classNames('ui-checkbox-field__input', inputClassName)}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="ui-checkbox-field__content">
        <span className="ui-checkbox-field__label">{label}</span>
        {description ? (
          <span className="ui-checkbox-field__description">{description}</span>
        ) : null}
      </span>
    </label>
  );
};

export default CheckboxField;
