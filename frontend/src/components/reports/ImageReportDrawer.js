import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
  Locate,
  Search,
  X,
} from 'lucide-react';

import Button from '../ui/Button';
import CheckboxField from '../ui/CheckboxField';
import IconButton from '../ui/IconButton';
import TextInput from '../ui/TextInput';

const UNKNOWN_TYPE = 'unknown';

const ImageReportDrawer = ({
  isOpen,
  onClose,
  issues = [],
  onSelectIssue,
  onOpenIssueUrl,
  reportTitle = 'Current map',
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState('');
  const bodyRef = useRef(null);

  const typeOptions = useMemo(() => {
    const optionMap = new Map();
    issues.forEach((issue) => {
      const key = issue.type || UNKNOWN_TYPE;
      const current = optionMap.get(key) || {
        key,
        label: issue.label || 'Capture issue',
        count: 0,
      };
      current.count += 1;
      optionMap.set(key, current);
    });
    return Array.from(optionMap.values());
  }, [issues]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      return;
    }
    if (shouldRender) {
      setIsClosing(true);
      const timeout = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!isOpen) return;
    const nextFilters = {};
    typeOptions.forEach((option) => {
      nextFilters[option.key] = true;
    });
    setFilters(nextFilters);
    setSearch('');
    setShowFilters(false);
  }, [isOpen, typeOptions]);

  useEffect(() => {
    if (!shouldRender) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, shouldRender]);

  const activeFilterKeys = useMemo(
    () => Object.entries(filters).filter(([, value]) => value).map(([key]) => key),
    [filters]
  );

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    const allFiltersEnabled = typeOptions.every((option) => filters[option.key]);
    return issues.filter((issue) => {
      const type = issue.type || UNKNOWN_TYPE;
      const matchesFilters = allFiltersEnabled
        ? true
        : activeFilterKeys.length === 0
        ? true
        : activeFilterKeys.includes(type);
      if (!matchesFilters) return false;
      if (!query) return true;
      return [
        issue.pageNumber,
        issue.title,
        issue.label,
        issue.url,
        issue.detail,
        issue.status,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [activeFilterKeys, filters, issues, search, typeOptions]);

  const safeReportTitle = String(reportTitle || 'Current map');
  const truncatedTitle = safeReportTitle.length > 56
    ? `${safeReportTitle.slice(0, 56).trim()}...`
    : safeReportTitle;

  if (!shouldRender) return null;

  return (
    <aside
      className={`report-drawer image-report-drawer ${isClosing ? 'report-drawer-closing' : 'report-drawer-open'}`}
      data-feedback-id="image-report-drawer"
      data-feedback-label="Image report drawer"
      role="dialog"
      aria-label="Image report"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => {
        e.stopPropagation();
        e.nativeEvent?.stopImmediatePropagation?.();
      }}
      onWheelCapture={(e) => {
        e.stopPropagation();
        e.nativeEvent?.stopImmediatePropagation?.();
      }}
    >
      <header className="report-drawer-header">
        <div className="report-header-title">
          <div className="report-drawer-title">Image report - {truncatedTitle}</div>
          <div className="report-drawer-subtitle">
            {issues.length} image issue{issues.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="report-header-actions">
          <IconButton
            className="report-drawer-close"
            size="lg"
            variant="ghost"
            icon={<X />}
            label="Close image report"
            onClick={onClose}
          />
        </div>
      </header>

      <div
        className="report-drawer-body"
        ref={bodyRef}
        onWheel={(e) => {
          e.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation?.();
        }}
        onWheelCapture={(e) => {
          e.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation?.();
        }}
      >
        <section className="report-summary image-report-summary">
          <div className="report-total-card">
            <div className="report-total-value">{issues.length}</div>
            <div className="report-total-label">Image issues</div>
          </div>
          <div className="report-stat-cards">
            {typeOptions.map((option, index) => (
              <div
                key={option.key}
                className="report-stat"
                data-bar-index={(index % 8) + 1}
              >
                <div className="report-stat-label">{option.label}</div>
                <div className="report-stat-value">{option.count}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="report-divider" />

        <section className="report-filters report-filters-sticky image-report-filters">
          <div className="report-filter-row">
            <button
              type="button"
              className="report-filter-toggle"
              onClick={() => setShowFilters((prev) => !prev)}
              disabled={typeOptions.length === 0}
            >
              <Filter size={16} />
              Filter by issue
              {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <label className="report-search">
              <Search size={16} />
              <TextInput
                type="text"
                className="report-search-input"
                framed={false}
                placeholder="Search image issues"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {showFilters && typeOptions.length > 0 && (
            <div className="report-filter-list">
              {typeOptions.map((option) => (
                <div key={option.key} className="report-filter-item">
                  <CheckboxField
                    checked={filters[option.key] || false}
                    onChange={() => {
                      setFilters((prev) => ({ ...prev, [option.key]: !prev[option.key] }));
                    }}
                    label={option.label}
                  />
                  <span className="report-filter-count">{option.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {filteredIssues.length === 0 ? (
          <div className="report-empty">
            {issues.length === 0 ? 'No image issues found.' : 'No image issues match your filters.'}
          </div>
        ) : (
          <div className="image-report-list" role="list">
            {filteredIssues.map((issue, index) => (
              <div className="image-report-row" role="listitem" key={issue.id || `${issue.nodeId || 'issue'}-${index}`}>
                <div className="image-report-row-main">
                  <div className="image-report-row-content">
                    <div className="image-report-row-title">
                      {issue.pageNumber ? <span>{issue.pageNumber}</span> : null}
                      <strong>{issue.title || 'Untitled page'}</strong>
                    </div>
                    <span className={`capture-issue-label capture-issue-label-${issue.type || UNKNOWN_TYPE}`}>
                      {issue.label || 'Capture issue'}
                    </span>
                    {issue.url ? <span className="image-report-url">{issue.url}</span> : null}
                    {issue.detail ? <span className="image-report-detail">{issue.detail}</span> : null}
                  </div>
                  <div className="image-report-row-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      startIcon={<Locate size={14} />}
                      onClick={() => onSelectIssue?.(issue)}
                      disabled={!issue.nodeId}
                    >
                      Select
                    </Button>
                    {issue.url ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        startIcon={<ExternalLink size={14} />}
                        onClick={() => onOpenIssueUrl?.(issue)}
                      >
                        Open
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

export default ImageReportDrawer;
