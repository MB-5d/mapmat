import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpToLine,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Filter,
  Locate,
  X,
} from 'lucide-react';

import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import { MenuItem, MenuPanel } from '../ui/Menu';
import SearchInput from '../ui/SearchInput';
import { comparePageNumbers } from '../../utils/reportUtils';

const REPORT_FILTER_META = {
  orphanPages: { label: 'Orphan', className: 'report-filter-chip--orphan' },
  duplicates: { label: 'Duplicate', className: 'report-filter-chip--warning' },
  missing: { label: 'Missing', className: 'report-filter-chip--warning' },
  errorPages: { label: 'Error', className: 'report-filter-chip--danger' },
  brokenLinks: { label: 'Broken links', className: 'report-filter-chip--danger' },
  inactivePages: { label: 'Inactive', className: 'report-filter-chip--muted' },
  subdomains: { label: 'Subdomain', className: 'report-filter-chip--info' },
  files: { label: 'Files', className: 'report-filter-chip--info' },
  authenticatedPages: { label: 'Authenticated', className: 'report-filter-chip--warning' },
  missingTitle: { label: 'No title', className: 'report-filter-chip--warning' },
  shortTitle: { label: 'Short title', className: 'report-filter-chip--info' },
  longTitle: { label: 'Very long title', className: 'report-filter-chip--warning' },
  missingDescription: { label: 'No description', className: 'report-filter-chip--warning' },
  shortDescription: { label: 'Short description', className: 'report-filter-chip--info' },
  longDescription: { label: 'Very long description', className: 'report-filter-chip--warning' },
  missingH1: { label: 'No H1', className: 'report-filter-chip--warning' },
};

const ReportDrawer = ({
  isOpen,
  onClose,
  entries,
  stats,
  typeOptions,
  onDownload,
  onLocateNode,
  onLocateUrl,
  onUpgrade,
  reportTitle,
  scanMeta,
}) => {
  const [sortConfig, setSortConfig] = useState({ key: 'number', direction: 'asc' });
  const [showFilters, setShowFilters] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const bodyRef = useRef(null);
  const filterMenuRef = useRef(null);
  const [filters, setFilters] = useState(() => {
    const initial = {};
    typeOptions.forEach(option => {
      initial[option.key] = false;
    });
    return initial;
  });

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
    const next = {};
    typeOptions.forEach(option => {
      next[option.key] = false;
    });
    setFilters(next);
  }, [isOpen, typeOptions]);

  useEffect(() => {
    if (!isOpen) setShowBackToTop(false);
  }, [isOpen]);

  useEffect(() => {
    if (!showFilters) return undefined;

    const handlePointerDown = (event) => {
      if (filterMenuRef.current?.contains(event.target)) return;
      setShowFilters(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowFilters(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showFilters]);

  const typeLookup = useMemo(() => {
    const map = new Map();
    typeOptions.forEach(option => {
      map.set(option.key, option.label);
    });
    return map;
  }, [typeOptions]);

  const filterCounts = useMemo(() => {
    const counts = {};
    typeOptions.forEach(option => {
      counts[option.key] = 0;
    });
    entries.forEach(entry => {
      entry.types.forEach(type => {
        counts[type] = (counts[type] || 0) + 1;
      });
    });
    return counts;
  }, [entries, typeOptions]);

  const typeFilterOptions = useMemo(
    () => typeOptions
      .filter(option => option.key !== 'standard' && filterCounts[option.key] > 0)
      .map(option => ({
        ...option,
        matches: (entry) => entry.types.includes(option.key),
      })),
    [typeOptions, filterCounts]
  );

  const extraFilterOptions = useMemo(() => {
    const options = [];
    if (entries.some(entry => Boolean(entry.thumbnailUrl))) {
      options.push({
        key: 'hasImage',
        label: 'Has image',
        matches: (entry) => Boolean(entry.thumbnailUrl),
      });
    }
    return options;
  }, [entries]);

  const visibleFilterOptions = useMemo(
    () => [...typeFilterOptions, ...extraFilterOptions],
    [typeFilterOptions, extraFilterOptions]
  );
  const scanCollapseReason = scanMeta?.partialReason === 'scan_collapsed'
    ? (scanMeta?.scanDiagnostics?.collapseReason || 'Root-only scan returned after discovery signals were found')
    : '';
  const entitlementNotice = scanMeta?.entitlement?.capped && scanMeta.entitlement.limitReached !== false
    ? scanMeta.entitlement
    : null;

  const activeFilterKeys = useMemo(
    () => visibleFilterOptions.filter(option => filters[option.key]).map(option => option.key),
    [filters, visibleFilterOptions]
  );
  const hasActiveFilters = activeFilterKeys.length > 0;

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const activeFilterOptions = visibleFilterOptions.filter(option => filters[option.key]);
    return entries.filter(entry => {
      const matchesFilters = !hasActiveFilters
        ? true
        : activeFilterOptions.some(option => option.matches(entry));
      if (!matchesFilters) return false;
      if (!query) return true;
      return (
        (entry.title || '').toLowerCase().includes(query)
        || (entry.url || '').toLowerCase().includes(query)
        || (entry.number || '').toLowerCase().includes(query)
      );
    });
  }, [entries, filters, search, hasActiveFilters, visibleFilterOptions]);

  const entryOrder = useMemo(
    () => new Map(entries.map((entry, index) => [entry.id, index])),
    [entries]
  );

  const sortedEntries = useMemo(() => {
    const direction = sortConfig.direction === 'desc' ? -1 : 1;
    return [...filteredEntries].sort((left, right) => {
      let result = 0;

      if (sortConfig.key === 'number') {
        if (!left.number && right.number) result = 1;
        else if (left.number && !right.number) result = -1;
        else result = comparePageNumbers(left.number, right.number);
      } else if (sortConfig.key === 'pageType') {
        result = (left.pageType || '').localeCompare(right.pageType || '', undefined, { sensitivity: 'base' });
      } else if (sortConfig.key === 'title') {
        result = (left.title || left.url || '').localeCompare(right.title || right.url || '', undefined, { sensitivity: 'base' });
      } else if (sortConfig.key === 'issues') {
        result = (left.types?.length || 0) - (right.types?.length || 0);
      }

      if (result === 0) {
        result = (entryOrder.get(left.id) || 0) - (entryOrder.get(right.id) || 0);
      }

      return result * direction;
    });
  }, [entryOrder, filteredEntries, sortConfig]);

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

  const renderSortButton = (key, label, extraClassName = '') => {
    const isActive = sortConfig.key === key;

    return (
      <button
        type="button"
        className={`report-sort-button ${extraClassName} ${isActive ? 'active' : ''}`.trim()}
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

  const mapTitle = reportTitle?.trim() || 'Untitled Map';
  const truncatedMapTitle = mapTitle.length > 56
    ? `${mapTitle.slice(0, 56).trim()}…`
    : mapTitle;

  const handleBodyScroll = (event) => {
    setShowBackToTop(event.currentTarget.scrollTop > 240);
  };

  const scrollToTop = () => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleFilter = (key) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const showAllFilters = () => {
    setFilters((prev) => {
      const next = { ...prev };
      visibleFilterOptions.forEach(option => {
        next[option.key] = false;
      });
      return next;
    });
  };

  if (!shouldRender) return null;

  const statCards = [
    { key: 'orphanPages' },
    { key: 'inactivePages' },
    { key: 'errorPages' },
    { key: 'brokenLinks' },
    { key: 'files' },
    { key: 'subdomains' },
    { key: 'missing' },
    { key: 'duplicates' },
    { key: 'authenticatedPages' },
    { key: 'missingTitle' },
    { key: 'shortTitle' },
    { key: 'longTitle' },
    { key: 'missingDescription' },
    { key: 'shortDescription' },
    { key: 'longDescription' },
    { key: 'missingH1' },
  ]
    .map(segment => {
      const option = typeOptions.find(item => item.key === segment.key);
      const meta = REPORT_FILTER_META[segment.key] || {};
      return {
        ...segment,
        filterLabel: option?.label || meta.label || segment.key,
        label: meta.label || option?.label || segment.key,
        className: meta.className || 'report-filter-chip--info',
      };
    })
    .filter(segment => stats[segment.key] > 0 && visibleFilterOptions.some(option => option.key === segment.key));

  return (
    <aside
      className={`report-drawer ${isClosing ? 'report-drawer-closing' : 'report-drawer-open'}`}
      data-feedback-id="report-drawer"
      data-feedback-label="Report drawer"
      role="dialog"
      aria-label="Scan report"
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
          <div className="report-drawer-title">Scan report &amp; insights</div>
          <div className="report-drawer-subtitle" title={mapTitle}>{truncatedMapTitle}</div>
        </div>
        <div className="report-header-actions">
          <Button className="report-open-link" variant="secondary" size="sm" onClick={onDownload}>
            <Download size={14} />
            Download report
          </Button>
          <IconButton
            className="report-drawer-close"
            size="sm"
            variant="ghost"
            icon={<X />}
            label="Close report"
            onClick={onClose}
          />
        </div>
      </header>

      <div
        className="report-drawer-body"
        ref={bodyRef}
        onScroll={handleBodyScroll}
        onWheel={(e) => {
          e.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation?.();
        }}
        onWheelCapture={(e) => {
          e.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation?.();
        }}
      >
        {scanCollapseReason && (
          <div className="ui-status-alert ui-status-alert--warning report-scan-alert">
            <AlertTriangle size={16} className="ui-status-alert__icon" />
            <div className="ui-status-alert__content">
              <strong>Scan only confirmed the homepage.</strong>
              <span>Reason: {scanCollapseReason}</span>
            </div>
          </div>
        )}
        {entitlementNotice && (
          <div className="ui-status-alert ui-status-alert--warning report-upgrade-alert">
            <AlertTriangle size={16} className="ui-status-alert__icon" />
            <div className="ui-status-alert__content">
              <strong>Full map locked.</strong>
              <span>
                Showing {entitlementNotice.visiblePageLimit || entitlementNotice.allowedPages || 25} visible pages.
                Upgrade to see the full map.
              </span>
            </div>
            <Button type="button" variant="primary" size="sm" onClick={onUpgrade}>
              Upgrade plan
            </Button>
          </div>
        )}
        <section className={`report-summary ${statCards.length > 0 && statCards.length <= 4 ? 'report-summary--single-row' : ''}`}>
          <button
            type="button"
            className={`report-total-card ${!hasActiveFilters ? 'is-selected' : ''}`}
            onClick={showAllFilters}
            disabled={!hasActiveFilters}
            aria-pressed={!hasActiveFilters}
          >
            <div className="report-total-value">{stats.total}</div>
            <div className="report-total-label">Pages on map</div>
          </button>
          <div className="report-stat-cards">
            {statCards.map((segment) => (
              <button
                type="button"
                key={segment.key}
                className={`report-stat ${segment.className} ${filters[segment.key] ? 'is-selected' : ''}`}
                onClick={() => toggleFilter(segment.key)}
                aria-pressed={Boolean(filters[segment.key])}
                aria-label={`Filter by ${segment.filterLabel}`}
              >
                <div className="report-stat-label">{segment.label}</div>
                <div className="report-stat-value">{stats[segment.key]}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="report-table-region">
          <div className="report-controls-sticky">
            <div className="report-filter-row">
              <div className="report-filter-control" ref={filterMenuRef}>
                <button
                  type="button"
                  className={`report-filter-toggle ${hasActiveFilters ? 'has-active-filters' : ''}`}
                  onClick={() => setShowFilters((prev) => !prev)}
                  aria-expanded={showFilters}
                  aria-haspopup="menu"
                >
                  <Filter size={16} />
                  {hasActiveFilters && <span className="report-filter-active-dot" aria-hidden="true" />}
                  Filters
                  {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {showFilters && visibleFilterOptions.length > 0 && (
                  <MenuPanel className="report-filter-menu" role="menu">
                    {visibleFilterOptions.map((option) => {
                      const selected = Boolean(filters[option.key]);
                      return (
                        <MenuItem
                          key={option.key}
                          className="report-filter-menu-item"
                          role="menuitemcheckbox"
                          aria-checked={selected}
                          label={option.label}
                          endSlot={selected ? <Check size={14} aria-hidden="true" /> : null}
                          onClick={() => toggleFilter(option.key)}
                        />
                      );
                    })}
                  </MenuPanel>
                )}
              </div>
              <SearchInput
                size="sm"
                aria-label="Search report pages"
                placeholder="Search by page name, number, or URL"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
                className="report-search"
                inputClassName="report-search-input"
              />
            </div>
          </div>
          <section className="report-table">
            <div className="report-table-header">
              <div />
              <div>{renderSortButton('number', 'Number')}</div>
              <div>{renderSortButton('pageType', 'Page type')}</div>
              <div>{renderSortButton('title', 'Page name')}</div>
              <div>{renderSortButton('issues', 'Issues', 'report-header-issues')}</div>
              <div className="report-header-show">Show</div>
              <div />
            </div>
          <div
            className="report-table-body"
            onWheel={(e) => e.stopPropagation()}
            onWheelCapture={(e) => e.stopPropagation()}
          >
          {sortedEntries.map(entry => {
            const isExpanded = expandedRow === entry.id;
            const isLocked = Boolean(entry.isEntitlementLocked || entry.entitlementLocked);
            const seoRows = [
              ['HTTP status', entry.httpErrorLabel || (entry.statusCode ? `HTTP ${entry.statusCode}` : '')],
              ['Error type', entry.isViewableError ? 'Viewable HTTP error' : entry.httpErrorType],
              ['Scan status', entry.isVirtualMissing ? 'Missing virtual page' : entry.scanStatus],
              ['Reason', entry.blockedReason],
              ['Description', entry.description],
              ['Meta keywords', entry.metaKeywords],
              ['Canonical', entry.canonicalUrl],
              ['H1', entry.h1],
              ['H2', entry.h2],
              ['Robots', entry.robots],
              ['Language', entry.language],
              ['Open Graph title', entry.openGraph?.title],
              ['Open Graph description', entry.openGraph?.description],
              ['Twitter card', entry.twitter?.card],
            ].filter(([, value]) => value);
            return (
              <div key={entry.id} className={`report-row ${isLocked ? 'report-row--locked' : ''}`}>
                <div
                  className={`report-row-main ${isExpanded ? 'report-row-expanded' : ''}`}
                  onClick={() => {
                    if (isLocked) {
                      onUpgrade?.();
                      return;
                    }
                    setExpandedRow(isExpanded ? null : entry.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (isLocked) {
                        onUpgrade?.();
                        return;
                      }
                      setExpandedRow(isExpanded ? null : entry.id);
                    }
                  }}
                >
                  <div
                    className="report-level-swatch"
                    style={{ background: entry.levelColor || '#cbd5f5' }}
                  />
                  <div className="report-cell report-cell-number">{entry.number || '--'}</div>
                  <div className="report-cell report-cell-type">{entry.pageType}</div>
                  <div className="report-cell report-cell-title" title={entry.title || entry.url}>
                    <span>{entry.title || entry.url}</span>
                  </div>
                  <div className="report-cell report-cell-count">{isLocked ? 'Locked' : entry.types.length}</div>
                  <IconButton
                    htmlType="button"
                    className="report-map-link"
                    variant="ghost"
                    buttonStyle="brand"
                    size="xs"
                    icon={isLocked ? <ExternalLink /> : <Locate />}
                    label={isLocked ? 'Upgrade' : 'See on map'}
                    title={isLocked ? 'Upgrade' : 'See on map'}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isLocked) {
                        onUpgrade?.();
                        return;
                      }
                      onLocateNode?.(entry.id);
                    }}
                  />
                  <span className="report-row-toggle">
                    {!isLocked && (isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  </span>
                </div>
                {!isLocked && isExpanded && (
                  <div className="report-row-detail">
                    <div className="report-detail-main">
                      {entry.thumbnailUrl ? (
                        <div className="report-thumb">
                          <img src={entry.thumbnailUrl} alt={entry.title || entry.url} />
                        </div>
                      ) : (
                        <div className="report-thumb report-thumb-empty">No preview</div>
                      )}
                      <div className="report-detail-right">
                        <div className="report-detail-info">
                          <Button
                            type="button"
                            className="report-open-link"
                            variant="secondary"
                            size="sm"
                            onClick={() => window.open(entry.url, '_blank', 'noopener')}
                          >
                            Open page
                            <ExternalLink size={14} />
                          </Button>
                          <div className="report-detail-badges">
                            {entry.types.map(type => (
                              <span key={type} className="report-badge">
                                {typeLookup.get(type) || type}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="report-detail-links">
                          {entry.duplicateOf && (
                            <div className="report-detail-link-row">
                              <strong>Duplicate of:</strong>
                              <button
                                type="button"
                                className="report-internal-link"
                                onClick={() => onLocateUrl?.(entry.duplicateOf)}
                              >
                                {entry.duplicateOf.replace(/^https?:\/\//, '').replace(/^www\./i, '')}
                              </button>
                            </div>
                          )}
                          {entry.parentUrl && (
                            <div className="report-detail-link-row">
                              <strong>Parent:</strong>
                              <button
                                type="button"
                                className="report-internal-link"
                                onClick={() => onLocateUrl?.(entry.parentUrl)}
                              >
                                {entry.parentUrl.replace(/^https?:\/\//, '').replace(/^www\./i, '')}
                              </button>
                            </div>
                          )}
                          {entry.referrerUrl && (
                            <div className="report-detail-link-row">
                              <strong>Referrer:</strong>
                              <button
                                type="button"
                                className="report-internal-link"
                                onClick={() => onLocateUrl?.(entry.referrerUrl)}
                              >
                                {entry.referrerUrl.replace(/^https?:\/\//, '').replace(/^www\./i, '')}
                              </button>
                            </div>
                          )}
                          {seoRows.map(([label, value]) => (
                            <div className="report-detail-link-row" key={label}>
                              <strong>{label}:</strong>
                              <span>{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {sortedEntries.length === 0 && (
            <div className="report-empty">No pages match these filters yet.</div>
          )}
        </div>
      </section>
        </section>
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

export default ReportDrawer;
