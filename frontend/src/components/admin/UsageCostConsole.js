import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Calculator,
  Database,
  Download,
  HardDrive,
  Loader2,
  Mail,
  RefreshCw,
  Share2,
} from 'lucide-react';

import { getAdminUsageCosts } from '../../api';

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : '0';
}

function formatMoney(value, currency = 'USD') {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '$0.00';
  return number.toLocaleString([], {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: number > 0 && number < 1 ? 4 : 2,
  });
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function UsageMetricCard({ icon, label, value, detail }) {
  return (
    <div className="admin-usage-card">
      <div className="admin-usage-card-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export default function UsageCostConsole({ onSessionExpired }) {
  const [days, setDays] = useState('30');
  const [userId, setUserId] = useState('');
  const [mapId, setMapId] = useState('');
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminUsageCosts({
        days,
        userId: userId.trim(),
        mapId: mapId.trim(),
      });
      setUsage(data);
    } catch (err) {
      if (err?.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err.message || 'Failed to load usage costs.');
    } finally {
      setLoading(false);
    }
  }, [days, mapId, onSessionExpired, userId]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const handleSubmit = (event) => {
    event.preventDefault();
    loadUsage();
  };

  const summary = usage?.summary || {};
  const costs = usage?.costs || {};
  const assumptions = usage?.assumptions || {};
  const currency = costs.currency || 'USD';
  const costCategories = Array.isArray(costs.categories) ? costs.categories : [];
  const eventRows = Array.isArray(usage?.events?.byType) ? usage.events.byType : [];
  const topUsers = Array.isArray(usage?.topUsers) ? usage.topUsers : [];

  return (
    <section className="admin-console-panel admin-usage-panel">
      <div className="admin-usage-header">
        <div>
          <h2>Usage & Costs</h2>
          <p>{usage?.range?.since || 'Loading'} to {usage?.range?.until || ''}</p>
        </div>
        <button
          type="button"
          className="admin-console-secondary-btn"
          onClick={loadUsage}
          disabled={loading}
        >
          {loading ? <Loader2 size={16} className="admin-console-spinner" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      <form className="admin-usage-filters" onSubmit={handleSubmit}>
        <label>
          <span>Range</span>
          <select value={days} onChange={(event) => setDays(event.target.value)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">365 days</option>
          </select>
        </label>
        <label>
          <span>User ID</span>
          <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="All users" />
        </label>
        <label>
          <span>Map ID</span>
          <input value={mapId} onChange={(event) => setMapId(event.target.value)} placeholder="All maps" />
        </label>
        <button type="submit" className="admin-console-primary-btn" disabled={loading}>
          <Calculator size={16} />
          Apply
        </button>
      </form>

      {error ? <div className="admin-console-error">{error}</div> : null}

      {loading && !usage ? (
        <div className="admin-console-empty">
          <div className="admin-console-empty-icon">
            <Loader2 size={18} className="admin-console-spinner" />
          </div>
          <div className="admin-console-empty-copy">
            <div className="admin-console-empty-title">Loading usage</div>
          </div>
        </div>
      ) : null}

      {usage ? (
        <>
          <div className="admin-usage-grid">
            <UsageMetricCard
              icon={<Calculator size={18} />}
              label="Estimated cost"
              value={formatMoney(costs.totalUsd, currency)}
              detail={`${formatMoney(costs.variableUsd, currency)} variable`}
            />
            <UsageMetricCard
              icon={<BarChart3 size={18} />}
              label="Scan pages"
              value={formatNumber(summary.scanPages)}
              detail={`${formatNumber(summary.scanRuns)} scan records`}
            />
            <UsageMetricCard
              icon={<Database size={18} />}
              label="Projects / maps"
              value={`${formatNumber(summary.projects)} / ${formatNumber(summary.maps)}`}
              detail={`${formatNumber(summary.mapPages)} stored pages`}
            />
            <UsageMetricCard
              icon={<HardDrive size={18} />}
              label="Image storage"
              value={formatBytes(summary.imageStorageBytes)}
              detail={`${formatNumber(summary.imageAssets)} assets`}
            />
            <UsageMetricCard
              icon={<Download size={18} />}
              label="Downloads"
              value={formatNumber(summary.imageDownloadFileCount)}
              detail={formatBytes(summary.imageDownloadBytes)}
            />
            <UsageMetricCard
              icon={<Share2 size={18} />}
              label="Comments / shares"
              value={`${formatNumber(summary.comments)} / ${formatNumber(summary.shares)}`}
              detail={`${formatNumber(summary.additionalUsers)} added users`}
            />
            <UsageMetricCard
              icon={<Mail size={18} />}
              label="Emails"
              value={formatNumber(summary.emails)}
              detail={`${formatNumber(summary.jobFailures)} failed jobs`}
            />
          </div>

          <div className="admin-usage-columns">
            <div className="admin-usage-section">
              <h3>Cost Breakdown</h3>
              <div className="admin-usage-table-frame">
                <table className="admin-console-table admin-usage-table">
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costCategories.map((category) => (
                      <tr key={category.id}>
                        <td>{category.label}</td>
                        <td>{formatMoney(category.costUsd, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-usage-section">
              <h3>Tracked Events</h3>
              <div className="admin-usage-table-frame">
                <table className="admin-console-table admin-usage-table">
                  <thead>
                    <tr>
                      <th scope="col">Event</th>
                      <th scope="col">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventRows.length ? eventRows.slice(0, 12).map((row) => (
                      <tr key={row.eventType}>
                        <td>{row.eventType}</td>
                        <td>{formatNumber(row.quantity)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="2">No tracked usage events</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="admin-usage-columns">
            <div className="admin-usage-section">
              <h3>Top Users</h3>
              <div className="admin-usage-table-frame">
                <table className="admin-console-table admin-usage-table">
                  <thead>
                    <tr>
                      <th scope="col">User</th>
                      <th scope="col">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topUsers.length ? topUsers.slice(0, 8).map((user) => (
                      <tr key={user.id || user.email || 'unknown'}>
                        <td>{user.email || user.name || 'Unknown'}</td>
                        <td>{formatNumber(user.quantity)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="2">No user usage yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-usage-section">
              <h3>Assumptions</h3>
              <div className="admin-usage-assumptions">
                <div>
                  <span>Fixed monthly</span>
                  <strong>{formatMoney(costs.fixedUsd, currency)}</strong>
                </div>
                <div>
                  <span>Rate config</span>
                  <strong>{assumptions.updatedAt || 'Not set'}</strong>
                </div>
                {assumptions.configError ? (
                  <div className="admin-console-error">{assumptions.configError}</div>
                ) : null}
                {(assumptions.notes || []).slice(0, 3).map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
