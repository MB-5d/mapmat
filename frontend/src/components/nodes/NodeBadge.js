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

const getBadgeStyle = (label, badgeStyle) => {
  if (badgeStyle) return badgeStyle;
  if (/^HTTP\s+\d+/i.test(String(label || ''))) return 'error';
  return NODE_BADGE_STYLE[label] || 'neutral';
};

const NodeBadge = ({ label, className, children, badgeStyle, ...props }) => (
  <Badge
    className={classNames('node-badge', className)}
    type="hollow"
    badgeStyle={getBadgeStyle(label, badgeStyle)}
    size="sm"
    label={children ?? label}
    aria-hidden="true"
    {...props}
  />
);

export default NodeBadge;
