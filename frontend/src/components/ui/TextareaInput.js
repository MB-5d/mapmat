import React from 'react';

import classNames from '../../utils/classNames';

const TextareaInput = React.forwardRef(
  ({ size = 'md', className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={classNames('ui-textarea', `ui-textarea--${size}`, className)}
      {...props}
    />
  )
);

TextareaInput.displayName = 'TextareaInput';

export default TextareaInput;
