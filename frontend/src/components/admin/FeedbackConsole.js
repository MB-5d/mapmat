import React, { useDeferredValue, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Download,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';

import {
  createAdminFeedbackTheme,
  downloadAdminFeedbackExport,
  downloadAdminFeedbackThemeExport,
  getAdminFeedback,
  getAdminFeedbackThemes,
  updateAdminFeedback,
  updateAdminFeedbackTheme,
} from '../../api';
import { resolveApiAssetUrl } from '../../utils/assets';

const ITEM_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'themed', label: 'Themed' },
  { value: 'archived', label: 'Archived' },
];

const ITEM_INTENT_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'broken', label: 'Broken' },
  { value: 'confusing', label: 'Confusing' },
  { value: 'idea', label: 'Idea' },
  { value: 'like', label: 'Like' },
  { value: 'dislike', label: 'Dislike' },
];

const ITEM_SCOPE_OPTIONS = [
  { value: '', label: 'All scopes' },
  { value: 'whole_app', label: 'Whole app' },
  { value: 'flow', label: 'This flow' },
  { value: 'specific_thing', label: 'Specific thing' },
];

const THEME_STATUS_OPTIONS = [
  { value: 'watching', label: 'Watching' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ThemeEditorCard({ theme, onSave, saving }) {
  const [draft, setDraft] = useState(() => ({
    title: theme.title || '',
    summary: theme.summary || '',
    severity: theme.severity || 'medium',
    priorityBucket: theme.priorityBucket || 'medium',
    status: theme.status || 'watching',
    ownerLabel: theme.ownerLabel || '',
    externalTrackerType: theme.externalTrackerType || '',
    externalTrackerUrl: theme.externalTrackerUrl || '',
  }));
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft({
      title: theme.title || '',
      summary: theme.summary || '',
      severity: theme.severity || 'medium',
      priorityBucket: theme.priorityBucket || 'medium',
      status: theme.status || 'watching',
      ownerLabel: theme.ownerLabel || '',
      externalTrackerType: theme.externalTrackerType || '',
      externalTrackerUrl: theme.externalTrackerUrl || '',
    });
  }, [theme]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError('Theme title is required.');
      return;
    }
    setError('');
    await onSave(theme.id, draft, setError);
  };

  return (
    <form className="admin-feedback-theme-card" onSubmit={handleSubmit}>
      <div className="admin-feedback-theme-head">
        <div>
          <div className="admin-feedback-theme-title">{theme.title}</div>
          <div className="admin-feedback-theme-meta">
            {theme.feedbackCount} linked feedback
            {theme.averageRating ? ` • avg rating ${theme.averageRating.toFixed(1)}` : ''}
            {theme.lastFeedbackAt ? ` • latest ${formatDateTime(theme.lastFeedbackAt)}` : ''}
          </div>
        </div>
        <div className={`admin-feedback-priority-pill is-${draft.priorityBucket}`}>
          {draft.priorityBucket}
        </div>
      </div>

      <label>
        <span>Title</span>
        <input
          type="text"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          disabled={saving}
        />
      </label>

      <label>
        <span>Summary</span>
        <textarea
          rows={3}
          value={draft.summary}
          onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
          disabled={saving}
        />
      </label>

      <div className="admin-feedback-theme-grid">
        <label>
          <span>Status</span>
          <select
            value={draft.status}
            onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
            disabled={saving}
          >
            {THEME_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select
            value={draft.priorityBucket}
            onChange={(event) => setDraft((current) => ({ ...current, priorityBucket: event.target.value }))}
            disabled={saving}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Severity</span>
          <select
            value={draft.severity}
            onChange={(event) => setDraft((current) => ({ ...current, severity: event.target.value }))}
            disabled={saving}
          >
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Owner</span>
          <input
            type="text"
            value={draft.ownerLabel}
            onChange={(event) => setDraft((current) => ({ ...current, ownerLabel: event.target.value }))}
            disabled={saving}
          />
        </label>
      </div>

      <div className="admin-feedback-theme-grid">
        <label>
          <span>Tracker type</span>
          <input
            type="text"
            value={draft.externalTrackerType}
            onChange={(event) => setDraft((current) => ({ ...current, externalTrackerType: event.target.value }))}
            placeholder="Linear"
            disabled={saving}
          />
        </label>
        <label>
          <span>Tracker URL</span>
          <input
            type="url"
            value={draft.externalTrackerUrl}
            onChange={(event) => setDraft((current) => ({ ...current, externalTrackerUrl: event.target.value }))}
            placeholder="https://..."
            disabled={saving}
          />
        </label>
      </div>

      {error ? <div className="admin-console-error">{error}</div> : null}

      <div className="admin-feedback-theme-actions">
        <button type="submit" className="admin-console-primary-btn" disabled={saving}>
          {saving ? <Loader2 size={16} className="admin-console-spinner" /> : <Sparkles size={16} />}
          Save theme
        </button>
      </div>
    </form>
  );
}

export default function FeedbackConsole({ onSessionExpired }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState('');
  const [intent, setIntent] = useState('');
  const [scope, setScope] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState('');
  const [themes, setThemes] = useState([]);
  const [themesLoading, setThemesLoading] = useState(false);
  const [themesError, setThemesError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [updatingItemId, setUpdatingItemId] = useState('');
  const [savingThemeId, setSavingThemeId] = useState('');
  const [creatingTheme, setCreatingTheme] = useState(false);
  const [createThemeError, setCreateThemeError] = useState('');
  const [themeDraft, setThemeDraft] = useState({
    title: '',
    summary: '',
    severity: 'medium',
    priorityBucket: 'medium',
  });

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      setItemsLoading(true);
      setItemsError('');
      try {
        const data = await getAdminFeedback({
          query: deferredQuery,
          status,
          intent,
          scope,
          unassigned: unassignedOnly,
        });
        if (cancelled) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 401) {
          onSessionExpired?.();
          return;
        }
        setItemsError(error.message || 'Failed to load feedback.');
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    }

    loadItems();
    return () => {
      cancelled = true;
    };
  }, [deferredQuery, intent, onSessionExpired, reloadKey, scope, status, unassignedOnly]);

  useEffect(() => {
    let cancelled = false;

    async function loadThemes() {
      setThemesLoading(true);
      setThemesError('');
      try {
        const data = await getAdminFeedbackThemes();
        if (cancelled) return;
        setThemes(Array.isArray(data?.themes) ? data.themes : []);
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 401) {
          onSessionExpired?.();
          return;
        }
        setThemesError(error.message || 'Failed to load themes.');
      } finally {
        if (!cancelled) setThemesLoading(false);
      }
    }

    loadThemes();
    return () => {
      cancelled = true;
    };
  }, [onSessionExpired, reloadKey]);

  const newCount = items.filter((item) => item.triageStatus === 'new').length;
  const themedCount = items.filter((item) => item.themeId).length;
  const unassignedCount = items.filter((item) => !item.themeId).length;

  const handleItemUpdate = async (feedbackId, payload) => {
    setUpdatingItemId(feedbackId);
    try {
      await updateAdminFeedback(feedbackId, payload);
      setReloadKey((current) => current + 1);
    } catch (error) {
      if (error?.status === 401) {
        onSessionExpired?.();
        return;
      }
      setItemsError(error.message || 'Failed to update feedback item.');
    } finally {
      setUpdatingItemId('');
    }
  };

  const handleCreateTheme = async (event) => {
    event.preventDefault();
    if (!themeDraft.title.trim()) {
      setCreateThemeError('Theme title is required.');
      return;
    }

    setCreatingTheme(true);
    setCreateThemeError('');
    try {
      await createAdminFeedbackTheme(themeDraft);
      setThemeDraft({
        title: '',
        summary: '',
        severity: 'medium',
        priorityBucket: 'medium',
      });
      setReloadKey((current) => current + 1);
    } catch (error) {
      if (error?.status === 401) {
        onSessionExpired?.();
        return;
      }
      setCreateThemeError(error.message || 'Failed to create theme.');
    } finally {
      setCreatingTheme(false);
    }
  };

  const handleSaveTheme = async (themeId, payload, setLocalError) => {
    setSavingThemeId(themeId);
    try {
      await updateAdminFeedbackTheme(themeId, payload);
      setReloadKey((current) => current + 1);
    } catch (error) {
      if (error?.status === 401) {
        onSessionExpired?.();
        return;
      }
      setLocalError(error.message || 'Failed to update theme.');
    } finally {
      setSavingThemeId('');
    }
  };

  const handleExportItems = async () => {
    try {
      await downloadAdminFeedbackExport();
    } catch (error) {
      if (error?.status === 401) {
        onSessionExpired?.();
        return;
      }
      setItemsError(error.message || 'Failed to export feedback items.');
    }
  };

  const handleExportThemes = async () => {
    try {
      await downloadAdminFeedbackThemeExport();
    } catch (error) {
      if (error?.status === 401) {
        onSessionExpired?.();
        return;
      }
      setThemesError(error.message || 'Failed to export feedback themes.');
    }
  };

  return (
    <div className="admin-feedback-shell">
      <section className="admin-console-panel admin-feedback-panel">
        <div className="admin-feedback-toolbar">
          <div className="admin-console-search-input admin-feedback-search">
            <Search size={16} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search message, actor, route, or component"
            />
          </div>
          <div className="admin-feedback-filter-row">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {ITEM_STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select value={intent} onChange={(event) => setIntent(event.target.value)}>
              {ITEM_INTENT_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              {ITEM_SCOPE_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
            <label className="admin-feedback-toggle">
              <input
                type="checkbox"
                checked={unassignedOnly}
                onChange={(event) => setUnassignedOnly(event.target.checked)}
              />
              <span>Unassigned only</span>
            </label>
          </div>
          <div className="admin-feedback-summary-row">
            <span>{itemsLoading ? 'Loading…' : `${items.length} visible items`}</span>
            <span>{newCount} new</span>
            <span>{unassignedCount} unassigned</span>
            <span>{themedCount} linked</span>
          </div>
          <div className="admin-feedback-export-row">
            <button type="button" className="admin-console-secondary-btn" onClick={handleExportItems}>
              <Download size={16} />
              Export feedback CSV
            </button>
            <button type="button" className="admin-console-secondary-btn" onClick={handleExportThemes}>
              <Download size={16} />
              Export themes CSV
            </button>
          </div>
        </div>

        {itemsError ? <div className="admin-console-error">{itemsError}</div> : null}

        <div className="admin-feedback-item-list">
          {itemsLoading && items.length === 0 ? (
            <div className="admin-console-empty admin-console-table-state">
              <div className="admin-console-empty-icon">
                <Loader2 size={18} className="admin-console-spinner" />
              </div>
              <div className="admin-console-empty-copy">
                <div className="admin-console-empty-title">Loading feedback</div>
                <div className="admin-console-empty-subtitle">
                  Pulling the latest product and usability notes.
                </div>
              </div>
            </div>
          ) : null}

          {!itemsLoading && items.length === 0 ? (
            <div className="admin-console-empty admin-console-table-state">
              <div className="admin-console-empty-icon">
                <Sparkles size={18} />
              </div>
              <div className="admin-console-empty-copy">
                <div className="admin-console-empty-title">No feedback yet</div>
                <div className="admin-console-empty-subtitle">
                  New feedback will appear here as soon as testers send it in.
                </div>
              </div>
            </div>
          ) : null}

          {items.map((item) => {
            const isUpdating = updatingItemId === item.id;
            return (
              <article key={item.id} className="admin-feedback-item-card">
                <div className="admin-feedback-item-head">
                  <div className="admin-feedback-item-title-row">
                    <span className={`admin-feedback-chip is-${item.intent}`}>{item.intent}</span>
                    <span className={`admin-feedback-chip is-scope`}>{item.scope}</span>
                    <span className={`admin-feedback-chip is-status`}>{item.triageStatus}</span>
                    {item.rating ? <span className="admin-feedback-chip is-rating">Rating {item.rating}</span> : null}
                  </div>
                  <div className="admin-feedback-item-meta">
                    <span>{item.actorName || item.actorEmail || 'Anonymous'}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                    {item.routeSection ? <span>{item.routeSection}</span> : null}
                  </div>
                </div>

                <div className="admin-feedback-item-message">{item.message}</div>

                <div className="admin-feedback-item-detail-row">
                  <span>{item.componentLabel || item.componentKey || 'No specific target'}</span>
                  {item.screenshotPath ? (
                    <a
                      href={resolveApiAssetUrl(item.screenshotPath)}
                      target="_blank"
                      rel="noreferrer"
                      className="admin-feedback-inline-link"
                    >
                      Screenshot
                      <ArrowUpRight size={14} />
                    </a>
                  ) : null}
                </div>

                <div className="admin-feedback-item-controls">
                  <label>
                    <span>Status</span>
                    <select
                      value={item.triageStatus}
                      disabled={isUpdating}
                      onChange={(event) => handleItemUpdate(item.id, { triageStatus: event.target.value })}
                    >
                      {ITEM_STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Theme</span>
                    <select
                      value={item.themeId || ''}
                      disabled={isUpdating}
                      onChange={(event) => handleItemUpdate(item.id, { themeId: event.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {themes.map((theme) => (
                        <option key={theme.id} value={theme.id}>{theme.title}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="admin-console-panel admin-feedback-theme-panel">
        <div className="admin-feedback-theme-toolbar">
          <div>
            <div className="admin-feedback-column-title">Themes</div>
            <div className="admin-feedback-column-subtitle">
              Group recurring feedback into roadmap-ready themes.
            </div>
          </div>
        </div>

        <form className="admin-feedback-theme-create" onSubmit={handleCreateTheme}>
          <label>
            <span>New theme title</span>
            <input
              type="text"
              value={themeDraft.title}
              onChange={(event) => setThemeDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Export flow is unclear"
              disabled={creatingTheme}
            />
          </label>
          <label>
            <span>Summary</span>
            <textarea
              rows={3}
              value={themeDraft.summary}
              onChange={(event) => setThemeDraft((current) => ({ ...current, summary: event.target.value }))}
              placeholder="Short synthesis of the repeated feedback"
              disabled={creatingTheme}
            />
          </label>
          <div className="admin-feedback-theme-grid">
            <label>
              <span>Severity</span>
              <select
                value={themeDraft.severity}
                onChange={(event) => setThemeDraft((current) => ({ ...current, severity: event.target.value }))}
                disabled={creatingTheme}
              >
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select
                value={themeDraft.priorityBucket}
                onChange={(event) => setThemeDraft((current) => ({ ...current, priorityBucket: event.target.value }))}
                disabled={creatingTheme}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          {createThemeError ? <div className="admin-console-error">{createThemeError}</div> : null}
          <button type="submit" className="admin-console-primary-btn" disabled={creatingTheme}>
            {creatingTheme ? <Loader2 size={16} className="admin-console-spinner" /> : <Sparkles size={16} />}
            Create theme
          </button>
        </form>

        {themesError ? <div className="admin-console-error">{themesError}</div> : null}

        <div className="admin-feedback-theme-list">
          {themesLoading && themes.length === 0 ? (
            <div className="admin-console-empty admin-console-table-state">
              <div className="admin-console-empty-icon">
                <Loader2 size={18} className="admin-console-spinner" />
              </div>
              <div className="admin-console-empty-copy">
                <div className="admin-console-empty-title">Loading themes</div>
                <div className="admin-console-empty-subtitle">
                  Pulling current synthesis and roadmap buckets.
                </div>
              </div>
            </div>
          ) : null}

          {!themesLoading && themes.length === 0 ? (
            <div className="admin-console-empty admin-console-table-state">
              <div className="admin-console-empty-icon">
                <Sparkles size={18} />
              </div>
              <div className="admin-console-empty-copy">
                <div className="admin-console-empty-title">No themes yet</div>
                <div className="admin-console-empty-subtitle">
                  Create a theme when you start seeing repeated patterns in the feedback.
                </div>
              </div>
            </div>
          ) : null}

          {themes.map((theme) => (
            <ThemeEditorCard
              key={theme.id}
              theme={theme}
              saving={savingThemeId === theme.id}
              onSave={handleSaveTheme}
            />
          ))}
        </div>
      </aside>
    </div>
  );
}
