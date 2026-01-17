import React from 'react';

import classNames from '../../utils/classNames';

const SelectInput = React.forwardRef(
  ({ size = 'md', className, ...props }, ref) => (
    <select
      ref={ref}
      className={classNames('ui-select', `ui-select--${size}`, className)}
      {...props}
    />
  )
);

SelectInput.displayName = 'SelectInput';

export default SelectInput;
