import React from 'react';

import classNames from '../../utils/classNames';

export const FieldHint = ({ className, children, ...props }) => (
  <div className={classNames('field-hint', className)} {...props}>
    {children}
  </div>
);

export const FieldError = ({ className, children, ...props }) => (
  <div className={classNames('field-error', className)} role="alert" {...props}>
    {children}
  </div>
);

const Field = ({
  label,
  htmlFor,
  required = false,
  hint = '',
  error = '',
  className,
  children,
}) => (
  <div className={classNames('field', error && 'field--invalid', className)}>
    {label ? (
      <label className="field-label" htmlFor={htmlFor}>
        <span>{label}</span>
        {required ? <span className="field-required" aria-hidden="true">*</span> : null}
      </label>
    ) : null}
    {children}
    {error ? <FieldError>{error}</FieldError> : null}
    {!error && hint ? <FieldHint>{hint}</FieldHint> : null}
  </div>
);

export default Field;
