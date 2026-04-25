import React from 'react';

import classNames from '../../utils/classNames';
import Tag from '../ui/Tag';

const NodeBadge = ({ label, className, children, ...props }) => (
  <Tag
    className={classNames('node-badge', className)}
    label={children ?? label}
    aria-hidden="true"
    {...props}
  />
);

export default NodeBadge;
