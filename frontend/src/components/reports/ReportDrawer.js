import React, { useMemo, useState } from 'react';
import {
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
  reportTitle,
  reportTimestamp,
}) => {
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [filters, setFilters] = useState(() => {
    const initial = {};
    typeOptions.forEach(option => {
      initial[option.key] = true;
    });
    return initial;
  });

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

  const activeFilterKeys = useMemo(
    () => Object.entries(filters).filter(([, value]) => value).map(([key]) => key),
    [filters]
  );

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter(entry => {
      const matchesFilters = activeFilterKeys.length === 0
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
  }, [entries, activeFilterKeys, search]);

  if (!isOpen) return null;

  const totalIssues = Object.entries(stats)
    .filter(([key]) => key !== 'total')
    .reduce((sum, [, value]) => sum + value, 0);

  const barSegments = [
    { key: 'orphanPages', label: 'Orphan pages' },
    { key: 'inactivePages', label: 'Inactive pages' },
    { key: 'errorPages', label: 'Error pages' },
    { key: 'brokenLinks', label: 'Broken links' },
    { key: 'files', label: 'Files / Downloads' },
    { key: 'subdomains', label: 'Subdomains' },
    { key: 'missing', label: 'Missing' },
    { key: 'duplicates', label: 'Duplicates' },
  ].filter(segment => stats[segment.key] > 0);

  return (
    <aside
      className="report-drawer report-drawer-open"
      role="dialog"
      aria-label="Scan report"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <header className="report-drawer-header">
        <div>
          <div className="report-drawer-title">Scan report — {reportTitle}</div>
          <div className="report-drawer-subtitle">{reportTimestamp || '—'}</div>
        </div>
        <button className="report-drawer-close" onClick={onClose} aria-label="Close report">
          <X size={18} />
        </button>
      </header>

      <div className="report-drawer-actions">
        <button className="btn-secondary report-download-btn" onClick={onDownload}>
          <Download size={16} />
          Download report
        </button>
      </div>

      <section className="report-summary">
        <div className="report-total">
          <span>Total pages</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="report-bar" role="img" aria-label="Issues distribution">
          {barSegments.length === 0 && <span className="report-bar-segment report-bar-segment-1" style={{ flex: 1 }} />}
          {barSegments.map((segment, index) => (
            <span
              key={segment.key}
              className={`report-bar-segment report-bar-segment-${index + 1}`}
              style={{
                flex: totalIssues ? stats[segment.key] : 0,
              }}
              title={`${segment.label}: ${stats[segment.key]}`}
            />
          ))}
        </div>
        <div className="report-stat-cards">
          {barSegments.map((segment) => (
            <div key={segment.key} className="report-stat">
              <div className="report-stat-label">{segment.label}</div>
              <div className="report-stat-value">{stats[segment.key]}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="report-filters">
        <div className="report-filter-row">
          <div className="report-filter-label">
            <Filter size={16} />
            Filter by
          </div>
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
        <div className="report-filter-list">
          {typeOptions.map(option => (
            <label
              key={option.key}
              className={`report-filter-item ${filterCounts[option.key] ? '' : 'disabled'}`}
            >
              <input
                type="checkbox"
                checked={filters[option.key] || false}
                onChange={() => {
                  setFilters(prev => ({ ...prev, [option.key]: !prev[option.key] }));
                }}
                disabled={!filterCounts[option.key]}
              />
              <span>{option.label}</span>
              <span className="report-filter-count">{filterCounts[option.key] || 0}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="report-table">
        <div className="report-table-header">
          <div />
          <div>Number</div>
          <div>Page type</div>
          <div>Page name</div>
          <div>Issues</div>
          <div>Show on map</div>
        </div>
        <div className="report-table-body">
          {filteredEntries.map(entry => {
            const isExpanded = expandedRow === entry.id;
            return (
              <div key={entry.id} className="report-row">
                <div
                  className="report-row-main"
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
                  <div className="report-cell report-cell-title">{entry.title || entry.url}</div>
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
                      <div className="report-detail-info">
                        <div className="report-detail-link">
                          <a href={entry.url} target="_blank" rel="noreferrer">
                            {entry.url}
                          </a>
                          <ExternalLink size={14} />
                        </div>
                        <div className="report-detail-badges">
                          {entry.types.map(type => (
                            <span key={type} className="report-badge">
                              {typeLookup.get(type) || type}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {entry.duplicateOf && (
                      <div>
                        <strong>Duplicate of:</strong>{' '}
                        <a href={entry.duplicateOf} target="_blank" rel="noreferrer">
                          {entry.duplicateOf}
                        </a>
                      </div>
                    )}
                    {entry.parentUrl && (
                      <div>
                        <strong>Parent:</strong>{' '}
                        <a href={entry.parentUrl} target="_blank" rel="noreferrer">
                          {entry.parentUrl}
                        </a>
                      </div>
                    )}
                    {entry.referrerUrl && (
                      <div>
                        <strong>Referrer:</strong>{' '}
                        <a href={entry.referrerUrl} target="_blank" rel="noreferrer">
                          {entry.referrerUrl}
                        </a>
                      </div>
                    )}
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
    </aside>
  );
};

export default ReportDrawer;
