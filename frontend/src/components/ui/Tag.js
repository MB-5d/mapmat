import React from 'react';

import classNames from '../../utils/classNames';
import Icon from './Icon';

const TAG_TYPES = new Set(['fill', 'hollow']);
const TAG_STYLES = new Set(['brand', 'mono']);
const TAG_SIZES = new Set(['sm', 'md']);
const TAG_STATES = new Set(['rest', 'hover', 'focus']);

const Tag = React.forwardRef(
  (
    {
      as: Component = 'span',
      label = '',
      type = 'hollow',
      tagStyle = 'mono',
      size = 'md',
      state = 'rest',
      startIcon = null,
      endIcon = null,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const resolvedType = TAG_TYPES.has(type) ? type : 'hollow';
    const resolvedStyle = TAG_STYLES.has(tagStyle) ? tagStyle : 'mono';
    const resolvedSize = TAG_SIZES.has(size) ? size : 'md';
    const resolvedState = TAG_STATES.has(state) ? state : 'rest';
    const isInteractive = Component !== 'span' || props.onClick || props.tabIndex != null;
    const content = children ?? label;

    return (
      <Component
        ref={ref}
        className={classNames(
          'ui-tag',
          `ui-tag--${resolvedSize}`,
          `ui-tag--type-${resolvedType}`,
          `ui-tag--style-${resolvedStyle}`,
          `ui-tag--state-${resolvedState}`,
          isInteractive && 'ui-tag--interactive',
          className
        )}
        {...props}
      >
        {startIcon ? <Icon icon={startIcon} size={resolvedSize === 'sm' ? 'xs' : 'sm'} className="ui-tag__icon ui-tag__icon--start" /> : null}
        {content != null ? <span className="ui-tag__content">{content}</span> : null}
        {endIcon ? <Icon icon={endIcon} size={resolvedSize === 'sm' ? 'xs' : 'sm'} className="ui-tag__icon ui-tag__icon--end" /> : null}
      </Component>
    );
  }
);

Tag.displayName = 'Tag';

export default Tag;
