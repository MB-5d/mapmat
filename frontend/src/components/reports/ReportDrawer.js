import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpToLine,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Filter,
  Locate,
  Loader2,
  Search,
  X,
} from 'lucide-react';

import Button from '../ui/Button';
import CheckboxField from '../ui/CheckboxField';
import IconButton from '../ui/IconButton';
import TextInput from '../ui/TextInput';
import { comparePageNumbers } from '../../utils/reportUtils';

const INSIGHT_CATEGORY_LABELS = {
  seo: 'SEO',
  technical: 'Technical',
  ia: 'IA',
  content: 'Content',
  accessibility: 'Accessibility Hints',
};

const INSIGHT_SEVERITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

const SCORE_LABEL = (score) => (Number.isFinite(score) ? `${score}` : '--');

const ReportDrawer = ({
  isOpen,
  onClose,
  entries,
  stats,
  typeOptions,
  onDownload,
  insights,
  insightsLoading = false,
  insightsError = '',
  onRunInsights,
  onLocateNode,
  onLocateUrl,
  reportTitle,
  reportTimestamp,
}) => {
  const [sortConfig, setSortConfig] = useState({ key: 'number', direction: 'asc' });
  const [activeTab, setActiveTab] = useState('report');
  const [showFilters, setShowFilters] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [insightCategory, setInsightCategory] = useState('all');
  const [insightSeverity, setInsightSeverity] = useState('all');
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

  const pageInsightLookup = useMemo(() => {
    const map = new Map();
    (insights?.pageInsights || []).forEach((entry) => {
      if (entry.pageId) map.set(entry.pageId, entry);
      if (entry.url) map.set(entry.url, entry);
    });
    return map;
  }, [insights]);

  const filteredFindings = useMemo(() => {
    const findings = Array.isArray(insights?.findings) ? insights.findings : [];
    return findings.filter((finding) => (
      (insightCategory === 'all' || finding.category === insightCategory)
      && (insightSeverity === 'all' || finding.severity === insightSeverity)
    ));
  }, [insightCategory, insightSeverity, insights]);

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
          <div className="report-drawer-title">Report — {truncatedTitle}</div>
          <div className="report-drawer-subtitle">{reportTimestamp || '—'}</div>
        </div>
        <div className="report-header-actions">
          <Button className="report-open-link" variant="secondary" size="sm" onClick={onDownload}>
            <Download size={14} />
            Download report
          </Button>
          <IconButton
            className="report-drawer-close"
            size="lg"
            variant="ghost"
            icon={<X />}
            label="Close report"
            onClick={onClose}
          />
        </div>
      </header>

      <div className="report-tabs" role="tablist" aria-label="Report views">
        <button
          type="button"
          className={`report-tab ${activeTab === 'report' ? 'active' : ''}`}
          onClick={() => setActiveTab('report')}
        >
          Report
        </button>
        <button
          type="button"
          className={`report-tab ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          Insights
        </button>
      </div>

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
        {activeTab === 'report' ? (
          <>
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
              <TextInput
                type="text"
                className="report-search-input"
                framed={false}
                placeholder="Search by page name, number, or URL"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {showFilters && (
            <div className="report-filter-list">
              {visibleFilterOptions.map((option) => (
                <div key={option.key} className="report-filter-item">
                  <CheckboxField
                    checked={filters[option.key] || false}
                    onChange={() => {
                      setFilters((prev) => ({ ...prev, [option.key]: !prev[option.key] }));
                    }}
                    label={option.label}
                  />
                  <span className="report-filter-count">{filterCounts[option.key] || 0}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="report-table">
          <div className="report-table-header">
            <div />
            <div>{renderSortButton('number', 'Number')}</div>
            <div>{renderSortButton('pageType', 'Page type')}</div>
            <div>{renderSortButton('title', 'Page name')}</div>
            <div>{renderSortButton('issues', 'Issues', 'report-header-issues')}</div>
            <div>Show on map</div>
            <div />
          </div>
          <div
            className="report-table-body"
            onWheel={(e) => e.stopPropagation()}
            onWheelCapture={(e) => e.stopPropagation()}
          >
          {sortedEntries.map(entry => {
            const isExpanded = expandedRow === entry.id;
            const pageInsight = pageInsightLookup.get(entry.id) || pageInsightLookup.get(entry.url) || null;
            const seoRows = [
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
                    <span>{entry.title || entry.url}</span>
                    {pageInsight && (
                      <span className="report-page-score">{pageInsight.score}</span>
                    )}
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
                          {pageInsight && (
                            <div className="report-page-insight">
                              <strong>Page Insight Score</strong>
                              <span>{pageInsight.score}/100</span>
                              <small>{pageInsight.findingCount} finding{pageInsight.findingCount === 1 ? '' : 's'}</small>
                            </div>
                          )}
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
          </>
        ) : (
          <section className="insights-panel">
            {!insights && !insightsLoading && (
              <div className="insights-empty">
                <div className="insights-empty-title">Map Insights have not been run yet.</div>
                <div className="insights-empty-copy">Run deterministic checks against the current scan data.</div>
                <Button type="button" variant="primary" onClick={onRunInsights}>
                  Run Insights
                </Button>
              </div>
            )}

            {insightsLoading && (
              <div className="insights-empty">
                <Loader2 size={22} className="spin" />
                <div className="insights-empty-title">Running Insights...</div>
              </div>
            )}

            {insightsError && !insightsLoading && (
              <div className="insights-error">
                {insightsError}
              </div>
            )}

            {insights && !insightsLoading && (
              <>
                <section className="insights-summary">
                  <div className="insights-score-card insights-score-card-main">
                    <div className="insights-score-value">{SCORE_LABEL(insights.overallScore)}</div>
                    <div className="insights-score-label">Overall Health</div>
                  </div>
                  {Object.entries(INSIGHT_CATEGORY_LABELS).map(([key, label]) => (
                    <div key={key} className="insights-score-card">
                      <div className="insights-score-value">{SCORE_LABEL(insights.scores?.[key])}</div>
                      <div className="insights-score-label">{label}</div>
                    </div>
                  ))}
                </section>

                <section className="insights-counts">
                  <span>{insights.totals?.pages || 0} pages</span>
                  <span>{insights.findings?.length || 0} findings</span>
                  <span>{insights.totals?.errorPages || 0} error pages</span>
                  <span>{insights.totals?.missingMetaDescriptions || 0} missing descriptions</span>
                  <span>{insights.totals?.missingH1s || 0} missing H1s</span>
                </section>

                <section className="insights-actions">
                  <Button type="button" variant="secondary" size="sm" onClick={onRunInsights}>
                    Rerun Insights
                  </Button>
                  <label className="insights-filter">
                    Category
                    <select value={insightCategory} onChange={(event) => setInsightCategory(event.target.value)}>
                      <option value="all">All</option>
                      {Object.entries(INSIGHT_CATEGORY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="insights-filter">
                    Severity
                    <select value={insightSeverity} onChange={(event) => setInsightSeverity(event.target.value)}>
                      <option value="all">All</option>
                      {Object.entries(INSIGHT_SEVERITY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>
                </section>

                <section className="insights-findings">
                  {filteredFindings.map((finding) => (
                    <article key={finding.id} className={`insight-finding insight-${finding.severity}`}>
                      <div className="insight-finding-header">
                        <span className="insight-finding-title">{finding.title}</span>
                        <span className="insight-finding-meta">
                          {INSIGHT_CATEGORY_LABELS[finding.category] || finding.category} | {INSIGHT_SEVERITY_LABELS[finding.severity] || finding.severity}
                        </span>
                      </div>
                      <p>{finding.description}</p>
                      <p className="insight-recommendation">{finding.recommendation}</p>
                      <div className="insight-finding-footer">
                        <span>{finding.url || 'Site-wide'}</span>
                        {(finding.pageId || finding.url) && (
                          <button
                            type="button"
                            className="report-map-link"
                            onClick={() => {
                              if (finding.pageId) onLocateNode?.(finding.pageId);
                              else onLocateUrl?.(finding.url);
                            }}
                          >
                            <Locate size={16} />
                            See on map
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                  {filteredFindings.length === 0 && (
                    <div className="report-empty">No findings match these filters.</div>
                  )}
                </section>
              </>
            )}
          </section>
        )}
      {showBackToTop ? (
        <button type="button" className="drawer-back-to-top" onClick={scrollToTop}>
          <ArrowUpToLine size={16} />
          Back to top
        </button>
      ) : null}
      </div>
    </aside>
  );
};

export default ReportDrawer;
