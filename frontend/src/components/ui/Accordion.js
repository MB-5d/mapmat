import React from 'react';
import { ChevronDown } from 'lucide-react';

import classNames from '../../utils/classNames';

function Accordion({
  open,
  onOpenChange,
  title,
  meta = null,
  headerActions = null,
  children,
  id,
  className,
  contentClassName,
}) {
  const panelId = id;
  const triggerId = id ? `${id}-trigger` : undefined;

  return (
    <div className={classNames('ui-accordion', open && 'is-open', className)}>
      <div className="ui-accordion__header">
        <button
          id={triggerId}
          type="button"
          className="ui-accordion__trigger"
          aria-expanded={!!open}
          aria-controls={panelId}
          onClick={() => onOpenChange?.(!open)}
        >
          <span className="ui-accordion__title">{title}</span>
          <span className="ui-accordion__trailing">
            {meta ? <span className="ui-accordion__meta">{meta}</span> : null}
            <ChevronDown className="ui-accordion__chevron" size={18} aria-hidden="true" />
          </span>
        </button>
        {headerActions ? (
          <div className="ui-accordion__actions">
            {headerActions}
          </div>
        ) : null}
      </div>
      {open ? (
        <div
          id={panelId}
          className={classNames('ui-accordion__content', contentClassName)}
          role="region"
          aria-labelledby={triggerId}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default Accordion;
