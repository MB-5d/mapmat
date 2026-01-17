import React from 'react';

import classNames from '../../utils/classNames';

const TextInput = React.forwardRef(
  ({ size = 'md', className, ...props }, ref) => (
    <input
      ref={ref}
      className={classNames('ui-input', `ui-input--${size}`, className)}
      {...props}
    />
  )
);

TextInput.displayName = 'TextInput';

export default TextInput;
