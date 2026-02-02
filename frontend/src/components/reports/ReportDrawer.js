import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Filter,
  Locate,
  Search,
  X,
} from 'lucide-react';

const ReportDrawer = ({
  isOpen,
  onClose,
  entries,
  stats,
  typeOptions,
  onDownload,
  onLocateNode,
  onLocateUrl,
  reportTitle,
  reportTimestamp,
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const bodyRef = useRef(null);
  const [filters, setFilters] = useState(() => {
    const initial = {};
    typeOptions.forEach(option => {
      initial[option.key] = true;
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
      next[option.key] = true;
    });
    setFilters(next);
  }, [isOpen, typeOptions]);

  useEffect(() => {
    if (!isOpen) setShowBackToTop(false);
  }, [isOpen]);

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

  const visibleFilterOptions = useMemo(
    () => typeOptions.filter(option => filterCounts[option.key] > 0),
    [typeOptions, filterCounts]
  );

  const activeFilterKeys = useMemo(
    () => Object.entries(filters).filter(([, value]) => value).map(([key]) => key),
    [filters]
  );

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const allFiltersEnabled = visibleFilterOptions.every(option => filters[option.key]);
    return entries.filter(entry => {
      const matchesFilters = allFiltersEnabled
        ? true
        : activeFilterKeys.length === 0
        ? true
        : entry.types.some(type => activeFilterKeys.includes(type));
      if (!matchesFilters) return false;
      if (!query) return true;
      return (
        (entry.title || '').toLowerCase().includes(query)
        || (entry.url || '').toLowerCase().includes(query)
        || (entry.number || '').toLowerCase().includes(query)
      );
    });
  }, [entries, activeFilterKeys, search, visibleFilterOptions, filters]);

  const truncatedTitle = reportTitle.length > 56
    ? `${reportTitle.slice(0, 56).trim()}…`
    : reportTitle;

  const handleBodyScroll = (event) => {
    setShowBackToTop(event.currentTarget.scrollTop > 240);
  };

  const scrollToTop = () => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!shouldRender) return null;

  const statCards = [
    { key: 'orphanPages', label: 'Orphan pages' },
    { key: 'inactivePages', label: 'Inactive pages' },
    { key: 'errorPages', label: 'Error pages' },
    { key: 'brokenLinks', label: 'Broken links' },
    { key: 'files', label: 'Files / Downloads' },
    { key: 'subdomains', label: 'Subdomains' },
    { key: 'missing', label: 'Missing' },
    { key: 'duplicates', label: 'Duplicate' },
  ].filter(segment => stats[segment.key] > 0);

  return (
    <aside
      className={`report-drawer ${isClosing ? 'report-drawer-closing' : 'report-drawer-open'}`}
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
          <div className="report-drawer-title">Report — {truncatedTitle}</div>
          <div className="report-drawer-subtitle">{reportTimestamp || '—'}</div>
        </div>
        <div className="report-header-actions">
          <button className="report-open-link" onClick={onDownload}>
            <Download size={14} />
            Download report
          </button>
          <button className="report-drawer-close" onClick={onClose} aria-label="Close report">
            <X size={22} />
          </button>
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
        <section className="report-summary">
          <div className="report-total-card">
            <div className="report-total-value">{stats.total}</div>
            <div className="report-total-label">Pages on map</div>
          </div>
          <div className="report-stat-cards">
            {statCards.map((segment, index) => (
              <div
                key={segment.key}
                className="report-stat"
                data-bar-index={index + 1}
              >
                <div className="report-stat-label">{segment.label}</div>
                <div className="report-stat-value">{stats[segment.key]}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="report-divider" />

        <section className="report-filters report-filters-sticky">
          <div className="report-filter-row">
            <button
              type="button"
              className="report-filter-toggle"
              onClick={() => setShowFilters((prev) => !prev)}
            >
              <Filter size={16} />
              Filter by
              {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <label className="report-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by page name, number, or URL"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {showFilters && (
            <div className="report-filter-list">
              {visibleFilterOptions.map(option => (
              <label
                key={option.key}
                className="report-filter-item"
              >
                <input
                  type="checkbox"
                  checked={filters[option.key] || false}
                  onChange={() => {
                    setFilters(prev => ({ ...prev, [option.key]: !prev[option.key] }));
                  }}
                />
                <span>{option.label}</span>
                <span className="report-filter-count">{filterCounts[option.key] || 0}</span>
              </label>
            ))}
            </div>
          )}
        </section>

        <section className="report-table">
          <div className="report-table-header">
            <div />
            <div>Number</div>
            <div>Page type</div>
            <div>Page name</div>
            <div className="report-header-issues">Issues</div>
            <div>Show on map</div>
            <div />
          </div>
          <div
            className="report-table-body"
            onWheel={(e) => e.stopPropagation()}
            onWheelCapture={(e) => e.stopPropagation()}
          >
          {filteredEntries.map(entry => {
            const isExpanded = expandedRow === entry.id;
            return (
              <div key={entry.id} className="report-row">
                <div
                  className={`report-row-main ${isExpanded ? 'report-row-expanded' : ''}`}
                  onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
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
                    {entry.title || entry.url}
                  </div>
                  <div className="report-cell report-cell-count">{entry.types.length}</div>
                  <button
                    className="report-map-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onLocateNode?.(entry.id);
                    }}
                  >
                    <Locate size={16} />
                    See on map
                  </button>
                  <span className="report-row-toggle">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </div>
                {isExpanded && (
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
                          <button
                            type="button"
                            className="report-open-link"
                            onClick={() => window.open(entry.url, '_blank', 'noopener')}
                          >
                            Open page
                            <ExternalLink size={14} />
                          </button>
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
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredEntries.length === 0 && (
            <div className="report-empty">No pages match these filters yet.</div>
          )}
        </div>
      </section>
      {showBackToTop ? (
        <button type="button" className="drawer-back-to-top" onClick={scrollToTop}>
          <ArrowUp size={16} />
          Back to top
        </button>
      ) : null}
      </div>
    </aside>
  );
};

export default ReportDrawer;
