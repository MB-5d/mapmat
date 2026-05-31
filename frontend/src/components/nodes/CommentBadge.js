import React from 'react';
import { MessageSquare } from 'lucide-react';

import classNames from '../../utils/classNames';
import Icon from '../ui/Icon';

const CommentBadge = ({
  count = 0,
  className,
  title,
  onClick,
  ...props
}) => {
  const label = count > 1 ? `View ${count} notes` : 'View notes';

  return (
    <button
      type="button"
      className={classNames('comment-badge', className)}
      onClick={onClick}
      title={title ?? label}
      {...props}
      aria-label={label}
    >
      <Icon icon={<MessageSquare />} size={12} className="comment-badge__icon" />
    </button>
  );
};

export default CommentBadge;
