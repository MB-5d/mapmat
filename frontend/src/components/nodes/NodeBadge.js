import React from 'react';

import classNames from '../../utils/classNames';
import { getNodeBadgeTone } from '../../utils/findingTones';
import Badge from '../ui/Badge';

const getBadgeStyle = (label, badgeStyle) => {
  if (badgeStyle) return badgeStyle;
  return getNodeBadgeTone(label);
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
