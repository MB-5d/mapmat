import React from 'react';

import classNames from '../../utils/classNames';

const ToggleSwitch = ({
  checked,
  onChange,
  label,
  description = '',
  disabled = false,
  className,
  ...props
}) => (
  <label className={classNames('ui-toggle', disabled && 'is-disabled', className)}>
    <span className="ui-toggle__content">
      <span className="ui-toggle__label">{label}</span>
      {description ? <span className="ui-toggle__description">{description}</span> : null}
    </span>
    <input
      {...props}
      type="checkbox"
      className="ui-toggle__input"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
    />
  </label>
);

export default ToggleSwitch;
