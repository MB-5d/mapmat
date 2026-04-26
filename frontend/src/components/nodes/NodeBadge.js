import React from 'react';

import classNames from '../../utils/classNames';
import Badge from '../ui/Badge';

const NodeBadge = ({ label, className, children, ...props }) => (
  <Badge
    className={classNames('node-badge', className)}
    type="hollow"
    badgeStyle="neutral"
    size="sm"
    label={children ?? label}
    aria-hidden="true"
    {...props}
  />
);

export default NodeBadge;
