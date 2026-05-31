import React from 'react';
import { User } from 'lucide-react';

import classNames from '../../utils/classNames';
import { resolveApiAssetUrl } from '../../utils/assets';
import Icon from './Icon';

const Avatar = ({
  src,
  label = '',
  icon = null,
  size = 'md',
  shape = 'circle',
  tone = null,
  bordered = false,
  className,
  imageClassName,
  alt = '',
  'aria-hidden': ariaHidden,
  ...props
}) => {
  const resolvedSrc = resolveApiAssetUrl(src);
  const fallbackIcon = <Icon icon={icon ?? <User />} size={size} />;
  const fallbackContent = typeof label === 'string' && label.trim() ? label : fallbackIcon;

  return (
    <span
      className={classNames(
        'ui-avatar',
        `ui-avatar--${size}`,
        `ui-avatar--${shape}`,
        tone !== null && tone !== undefined && `ui-avatar--tone-${tone}`,
        bordered && 'ui-avatar--bordered',
        className
      )}
      aria-hidden={ariaHidden}
      {...props}
    >
      {resolvedSrc ? (
        <img
          className={classNames('ui-avatar__image', imageClassName)}
          src={resolvedSrc}
          alt={alt}
        />
      ) : (
        fallbackContent
      )}
    </span>
  );
};

export default Avatar;
