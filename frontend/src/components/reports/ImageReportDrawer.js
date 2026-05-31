import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  ArrowUpToLine,
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
import { comparePageNumbers } from '../../utils/reportUtils';

const UNKNOWN_TYPE = 'unknown';

const ImageReportDrawer = ({
  isOpen,
  onClose,
  issues = [],
  onSelectIssue,
  onOpenIssueUrl,
  selectedNodeIds = new Set(),
  onSelectionChange,
  onCaptureSelectedThumbnails,
  onCaptureSelectedScreenshots,
  onRetryMissingThumbnails,
  onRetryMissingScreenshots,
  hasMissingThumbnails = false,
  hasMissingScreenshots = false,
  reportTitle = 'Current map',
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'number', direction: 'asc' });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const bodyRef = useRef(null);
  const listRef = useRef(null);
  const lastSelectedIndexRef = useRef(null);

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

  useEffect(() => {
    if (!isOpen) setShowBackToTop(false);
  }, [isOpen]);

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

  const issueOrder = useMemo(
    () => new Map(issues.map((issue, index) => [issue.id || `${issue.nodeId || 'issue'}-${index}`, index])),
    [issues]
  );

  const selectedNodeIdSet = useMemo(
    () => new Set(selectedNodeIds instanceof Set ? Array.from(selectedNodeIds) : selectedNodeIds || []),
    [selectedNodeIds]
  );

  const sortedIssues = useMemo(() => {
    const direction = sortConfig.direction === 'desc' ? -1 : 1;
    return [...filteredIssues].sort((left, right) => {
      let result = 0;

      if (sortConfig.key === 'number') {
        if (!left.pageNumber && right.pageNumber) result = 1;
        else if (left.pageNumber && !right.pageNumber) result = -1;
        else result = comparePageNumbers(left.pageNumber, right.pageNumber);
      } else if (sortConfig.key === 'type') {
        result = (left.label || left.type || '').localeCompare(right.label || right.type || '', undefined, { sensitivity: 'base' });
      } else if (sortConfig.key === 'title') {
        result = (left.title || left.url || '').localeCompare(right.title || right.url || '', undefined, { sensitivity: 'base' });
      }

      if (result === 0) {
        const leftKey = left.id || `${left.nodeId || 'issue'}-${filteredIssues.indexOf(left)}`;
        const rightKey = right.id || `${right.nodeId || 'issue'}-${filteredIssues.indexOf(right)}`;
        result = (issueOrder.get(leftKey) || 0) - (issueOrder.get(rightKey) || 0);
      }

      return result * direction;
    });
  }, [filteredIssues, issueOrder, sortConfig]);

  const selectableReportNodeIds = useMemo(
    () => Array.from(new Set(issues.map((issue) => issue.nodeId).filter(Boolean))),
    [issues]
  );

  const selectableVisibleNodeIds = useMemo(
    () => Array.from(new Set(sortedIssues.map((issue) => issue.nodeId).filter(Boolean))),
    [sortedIssues]
  );

  const selectedCount = selectedNodeIdSet.size;
  const selectedVisibleCount = selectableVisibleNodeIds.filter((nodeId) => selectedNodeIdSet.has(nodeId)).length;
  const allVisibleSelected = selectableVisibleNodeIds.length > 0 && selectedVisibleCount === selectableVisibleNodeIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const commitReportSelection = (nextSelection) => {
    onSelectionChange?.(Array.from(nextSelection));
  };

  const getReportSelection = () => (
    new Set(selectableReportNodeIds.filter((nodeId) => selectedNodeIdSet.has(nodeId)))
  );

  const handleToggleAllVisible = () => {
    const nextSelection = getReportSelection();
    if (allVisibleSelected) {
      selectableVisibleNodeIds.forEach((nodeId) => nextSelection.delete(nodeId));
    } else {
      selectableVisibleNodeIds.forEach((nodeId) => nextSelection.add(nodeId));
    }
    lastSelectedIndexRef.current = null;
    commitReportSelection(nextSelection);
  };

  const handleToggleIssue = (issue, index, event) => {
    if (!issue.nodeId) return;

    const nextSelection = getReportSelection();
    const shiftActive = event?.shiftKey || event?.nativeEvent?.shiftKey;
    if (shiftActive && lastSelectedIndexRef.current != null) {
      const start = Math.min(lastSelectedIndexRef.current, index);
      const end = Math.max(lastSelectedIndexRef.current, index);
      const rangeIssues = sortedIssues.slice(start, end + 1).filter((item) => item.nodeId);
      const shouldSelectRange = !selectedNodeIdSet.has(issue.nodeId);
      rangeIssues.forEach((item) => {
        if (shouldSelectRange) nextSelection.add(item.nodeId);
        else nextSelection.delete(item.nodeId);
      });
    } else if (nextSelection.has(issue.nodeId)) {
      nextSelection.delete(issue.nodeId);
    } else {
      nextSelection.add(issue.nodeId);
    }

    lastSelectedIndexRef.current = index;
    commitReportSelection(nextSelection);
  };

  const toggleSort = (key) => {
    setSortConfig((previous) => {
      if (previous.key === key) {
        return {
          key,
          direction: previous.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key, direction: 'asc' };
    });
  };

  const renderSortButton = (key, label) => {
    const isActive = sortConfig.key === key;

    return (
      <button
        type="button"
        className={`report-sort-button ${isActive ? 'active' : ''}`.trim()}
        onClick={() => toggleSort(key)}
      >
        <span>{label}</span>
        {isActive ? (
          sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        ) : (
          <ArrowUpDown size={14} />
        )}
      </button>
    );
  };

  const handleListScroll = (event) => {
    setShowBackToTop(event.currentTarget.scrollTop > 240);
  };

  const scrollToTop = () => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

        <section className="image-report-actions" aria-label="Image capture actions">
          <div className="image-report-actions-summary">
            <strong>{selectedCount}</strong>
            <span>selected</span>
          </div>
          <div className="image-report-actions-buttons">
            <Button
              variant="secondary"
              size="sm"
              onClick={onCaptureSelectedThumbnails}
              disabled={selectedCount === 0}
            >
              Capture selected visible area
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onCaptureSelectedScreenshots}
              disabled={selectedCount === 0}
            >
              Capture selected full page
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRetryMissingThumbnails}
              disabled={!hasMissingThumbnails}
            >
              Retry missing visible area
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRetryMissingScreenshots}
              disabled={!hasMissingScreenshots}
            >
              Retry missing full page
            </Button>
          </div>
        </section>

        <div
          className="image-report-list-shell"
          ref={listRef}
          onScroll={handleListScroll}
          role="region"
          aria-label="Image report issues"
        >
          {filteredIssues.length === 0 ? (
            <div className="report-empty">
              {issues.length === 0 ? 'No image issues found.' : 'No image issues match your filters.'}
            </div>
          ) : (
            <>
              <div className="image-report-list-header">
                <div className="image-report-select-heading">
                  <input
                    type="checkbox"
                    className="image-report-select-checkbox"
                    aria-label="Select all visible image issues"
                    checked={allVisibleSelected}
                    ref={(element) => {
                      if (element) element.indeterminate = someVisibleSelected;
                    }}
                    onChange={handleToggleAllVisible}
                    disabled={selectableVisibleNodeIds.length === 0}
                  />
                  {renderSortButton('number', 'Number')}
                </div>
                {renderSortButton('type', 'Issue')}
                {renderSortButton('title', 'Page')}
                <span>Actions</span>
              </div>
              <div className="image-report-list" role="list">
                {sortedIssues.map((issue, index) => (
                  <div className="image-report-row" role="listitem" key={issue.id || `${issue.nodeId || 'issue'}-${index}`}>
                    <div className="image-report-cell image-report-number">
                      <input
                        type="checkbox"
                        className="image-report-select-checkbox"
                        aria-label={`Select ${issue.title || 'image issue'}`}
                        checked={Boolean(issue.nodeId && selectedNodeIdSet.has(issue.nodeId))}
                        onChange={(event) => handleToggleIssue(issue, index, event)}
                        disabled={!issue.nodeId}
                      />
                      <span>{issue.pageNumber || '--'}</span>
                    </div>
                    <div className="image-report-cell image-report-type">
                      <span className={`capture-issue-label capture-issue-label-${issue.type || UNKNOWN_TYPE}`}>
                        {issue.label || 'Capture issue'}
                      </span>
                    </div>
                    <div className="image-report-row-content image-report-cell">
                      <div className="image-report-row-title">
                        <strong>{issue.title || 'Untitled page'}</strong>
                      </div>
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
                ))}
              </div>
            </>
          )}
        </div>
        {showBackToTop ? (
          <Button
            type="primary"
            buttonStyle="mono"
            size="sm"
            className="drawer-back-to-top"
            onClick={scrollToTop}
            startIcon={<ArrowUpToLine />}
          >
            Back to top
          </Button>
        ) : null}
      </div>
    </aside>
  );
};

export default ImageReportDrawer;
