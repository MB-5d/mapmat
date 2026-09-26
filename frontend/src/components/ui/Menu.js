import React from 'react';

import classNames from '../../utils/classNames';
import Icon from './Icon';

export const MenuPanel = React.forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} className={classNames('ui-menu-panel', className)} {...props}>
    {children}
  </div>
));

MenuPanel.displayName = 'MenuPanel';

// Tall menus use available viewport space before introducing scrolling.
export const MenuScrollArea = ({ children, className, opensUp = false, ...props }) => {
  const scrollRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const [overflow, setOverflow] = React.useState(false);
  const [atBottom, setAtBottom] = React.useState(false);

  React.useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const panel = scroller.closest('.ui-menu-panel');
    const measure = () => {
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const bottom = top + (viewport?.height || window.innerHeight);
      const rect = panel.getBoundingClientRect();
      const available = opensUp ? rect.bottom - top - 16 : bottom - rect.top - 16;
      panel.style.setProperty('--menu-available-height', `${Math.max(0, available)}px`);
      // Measure natural content rather than the cue, so the cue cannot toggle itself.
      const cue = scroller.parentElement.querySelector('.ui-menu-scroll-cue');
      const cueHeight = cue ? cue.getBoundingClientRect().height + 4 : 0;
      setOverflow(contentRef.current.scrollHeight > scroller.clientHeight + cueHeight + 1);
      setAtBottom(scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(panel);
    observer?.observe(scroller);
    observer?.observe(contentRef.current);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [opensUp]);

  return (
    <div className="ui-menu-scroll-area">
      <div
        {...props}
        ref={scrollRef}
        className={classNames('ui-menu-scroll-viewport', className)}
        onScroll={() => {
          const el = scrollRef.current;
          setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
        }}
      >
        <div ref={contentRef} className="ui-menu-scroll-content">{children}</div>
      </div>
      {overflow && (
        <button
          type="button"
          className="ui-menu-scroll-cue"
          onClick={() => {
            const el = scrollRef.current;
            el.scrollBy({ top: (atBottom ? -1 : 1) * el.clientHeight * 0.75, behavior: 'auto' });
          }}
        >
          {atBottom ? '↑ More options above' : '↓ More options below'}
        </button>
      )}
    </div>
  );
};

export const MenuTitle = ({ className, children, ...props }) => (
  <div className={classNames('ui-menu-title', className)} {...props}>
    {children}
  </div>
);

export const MenuSection = ({ className, children, ...props }) => (
  <div className={classNames('ui-menu-section', className)} {...props}>
    {children}
  </div>
);

export const MenuSectionHeader = ({ className, children, ...props }) => (
  <div className={classNames('ui-menu-section-header', className)} {...props}>
    {children}
  </div>
);

export const MenuDivider = ({ className, ...props }) => (
  <div className={classNames('ui-menu-divider', className)} role="separator" {...props} />
);

export const MenuItem = React.forwardRef(
  (
    {
      as: Component = 'button',
      className,
      icon = null,
      label,
      description,
      badge = null,
      endSlot = null,
      selected = false,
      danger = false,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => (
    <Component
      ref={ref}
      className={classNames(
        'ui-menu-item',
        selected && 'ui-menu-item--selected',
        danger && 'ui-menu-item--danger',
        className
      )}
      type={Component === 'button' ? type : undefined}
      {...props}
    >
      {icon ? <Icon icon={icon} className="ui-menu-item__icon" /> : null}
      <span className="ui-menu-item__content">
        {label != null ? <span className="ui-menu-item__label">{label}</span> : null}
        {description ? <span className="ui-menu-item__description">{description}</span> : null}
        {children}
      </span>
      {badge ? <span className="ui-menu-item__badge">{badge}</span> : null}
      {endSlot ? <span className="ui-menu-item__end">{endSlot}</span> : null}
    </Component>
  )
);

MenuItem.displayName = 'MenuItem';

export const MenuRadioItem = React.forwardRef(
  (
    {
      className,
      inputClassName,
      label,
      description,
      endSlot = null,
      checked = false,
      disabled = false,
      name,
      value,
      onChange,
      children,
      ...props
    },
    ref
  ) => (
    <label
      className={classNames(
        'ui-menu-radio-item',
        checked && 'ui-menu-radio-item--checked',
        disabled && 'ui-menu-radio-item--disabled',
        className
      )}
    >
      <input
        {...props}
        ref={ref}
        type="radio"
        className={classNames('ui-menu-radio-item__control', inputClassName)}
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange?.(value)}
        disabled={disabled}
      />
      <span className="ui-menu-radio-item__content">
        {label != null ? <span className="ui-menu-radio-item__label">{label}</span> : null}
        {description ? <span className="ui-menu-radio-item__description">{description}</span> : null}
        {children}
      </span>
      {endSlot ? <span className="ui-menu-radio-item__end">{endSlot}</span> : null}
    </label>
  )
);

MenuRadioItem.displayName = 'MenuRadioItem';
