import React from 'react';

import classNames from '../../utils/classNames';

const SelectInput = React.forwardRef(
  ({ size = 'md', invalid = false, className, ...props }, ref) => (
    <select
      ref={ref}
      className={classNames('ui-select', `ui-select--${size}`, invalid && 'ui-select--invalid', className)}
      {...props}
    />
  )
);

SelectInput.displayName = 'SelectInput';

export default SelectInput;
