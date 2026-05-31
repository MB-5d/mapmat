import React from 'react';

import classNames from '../../utils/classNames';

const Icon = React.forwardRef(
  (
    {
      icon = null,
      size = 'md',
      tone = 'inherit',
      style,
      className,
      decorative = true,
      ...props
    },
    ref
  ) => {
    if (!icon) return null;

    const content = React.isValidElement(icon)
      ? React.cloneElement(icon, {
          className: classNames('ui-icon__svg', icon.props.className),
          ...(typeof icon.type === 'string'
            ? {}
            : {
                size: '1em',
                color: 'currentColor',
              }),
          'aria-hidden': decorative ? true : icon.props['aria-hidden'],
          focusable: 'false',
        })
      : icon;

    const inlineSize = typeof size === 'number' ? `${size}px` : null;

    return (
      <span
        ref={ref}
        className={classNames(
          'ui-icon',
          typeof size === 'string' && `ui-icon--${size}`,
          tone !== 'inherit' && `ui-icon--${tone}`,
          className
        )}
        aria-hidden={decorative ? 'true' : undefined}
        style={inlineSize ? { fontSize: inlineSize, ...style } : style}
        {...props}
      >
        {content}
      </span>
    );
  }
);

Icon.displayName = 'Icon';

export default Icon;
