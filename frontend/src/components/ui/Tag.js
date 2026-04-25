import React from 'react';

import classNames from '../../utils/classNames';
import Icon from './Icon';

const Tag = React.forwardRef(
  (
    {
      as: Component = 'span',
      label = '',
      startIcon = null,
      endIcon = null,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const content = children ?? label;

    return (
      <Component
        ref={ref}
        className={classNames('ui-tag', className)}
        {...props}
      >
        {startIcon ? <Icon icon={startIcon} size="sm" className="ui-tag__icon ui-tag__icon--start" /> : null}
        {content != null ? <span className="ui-tag__content">{content}</span> : null}
        {endIcon ? <Icon icon={endIcon} size="sm" className="ui-tag__icon ui-tag__icon--end" /> : null}
      </Component>
    );
  }
);

Tag.displayName = 'Tag';

export default Tag;
