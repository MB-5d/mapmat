import React from 'react';

import classNames from '../../utils/classNames';

const NodeStatusBadge = ({
  status = 'note',
  label,
  note = false,
  title,
  className,
  ...props
}) => (
  <div
    className={classNames('node-status-badge', `status-${status}`, className)}
    title={title}
    aria-hidden="true"
    {...props}
  >
    <span className="node-status-text">{label}</span>
    {note ? <span className="node-status-note-dot" /> : null}
  </div>
);

export default NodeStatusBadge;
