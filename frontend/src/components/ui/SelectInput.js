import React from 'react';
import { ChevronDown } from 'lucide-react';

import classNames from '../../utils/classNames';

const SelectInput = React.forwardRef(
  ({ size = 'md', invalid = false, className, ...props }, ref) => (
    <span className="ui-select-shell">
      <select
        ref={ref}
        className={classNames('ui-select', `ui-select--${size}`, invalid && 'ui-select--invalid', className)}
        {...props}
      />
      <ChevronDown size={16} className="ui-select-chevron" aria-hidden="true" />
    </span>
  )
);

SelectInput.displayName = 'SelectInput';

export default SelectInput;
