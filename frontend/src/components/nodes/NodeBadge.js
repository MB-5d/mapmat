import React from 'react';

import classNames from '../../utils/classNames';
import Badge from '../ui/Badge';

const NODE_BADGE_STYLE = {
  Duplicate: 'warning',
  Missing: 'warning',
  File: 'info',
  'Broken Link': 'error',
  Auth: 'warning',
  Error: 'error',
  Inactive: 'neutral',
};

const NodeBadge = ({ label, className, children, badgeStyle, ...props }) => (
  <Badge
    className={classNames('node-badge', className)}
    type="hollow"
    badgeStyle={badgeStyle || NODE_BADGE_STYLE[label] || 'neutral'}
    size="sm"
    label={children ?? label}
    aria-hidden="true"
    {...props}
  />
);

export default NodeBadge;
