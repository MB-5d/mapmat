import React from 'react';

import classNames from '../../utils/classNames';

const TextInput = React.forwardRef(
  ({ size = 'md', invalid = false, className, ...props }, ref) => (
    <input
      ref={ref}
      className={classNames('ui-input', `ui-input--${size}`, invalid && 'ui-input--invalid', className)}
      {...props}
    />
  )
);

TextInput.displayName = 'TextInput';

export default TextInput;
