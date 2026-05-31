import React from 'react';

import classNames from '../../utils/classNames';

const RadioCardGroup = ({
  value,
  onChange,
  name,
  options,
  className,
}) => (
  <div className={classNames('ui-radio-card-group', className)} role="radiogroup">
    {options.map((option) => (
      <label
        key={option.value}
        className={classNames(
          'ui-radio-card',
          value === option.value && 'is-selected',
          option.disabled && 'is-disabled'
        )}
      >
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={value === option.value}
          onChange={() => onChange?.(option.value)}
          disabled={option.disabled}
        />
        {option.icon ? <span className="ui-radio-card__icon">{option.icon}</span> : null}
        <span className="ui-radio-card__content">
          <span className="ui-radio-card__label">{option.label}</span>
          {option.description ? (
            <span className="ui-radio-card__description">{option.description}</span>
          ) : null}
        </span>
      </label>
    ))}
  </div>
);

export default RadioCardGroup;
