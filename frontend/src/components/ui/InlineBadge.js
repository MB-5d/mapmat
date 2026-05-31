import React from 'react';

import Badge from './Badge';
import classNames from '../../utils/classNames';

const InlineBadge = React.forwardRef((props, ref) => (
  <Badge
    ref={ref}
    {...props}
    className={classNames('ui-inline-badge', props.className)}
  />
));

InlineBadge.displayName = 'InlineBadge';

export default InlineBadge;
