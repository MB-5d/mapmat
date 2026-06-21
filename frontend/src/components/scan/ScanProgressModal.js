import React from 'react';
import { AlertTriangle } from 'lucide-react';

import Button from '../ui/Button';
import Modal from '../ui/Modal';

const FINDING_ITEMS = [
  { key: 'brokenLinks', label: 'Broken links' },
  { key: 'duplicates', label: 'Duplicate' },
  { key: 'missing', label: 'Missing' },
  { key: 'errorPages', label: 'Error' },
  { key: 'inactivePages', label: 'Inactive' },
  { key: 'redirects', label: 'Redirects' },
  { key: 'authenticatedPages', label: 'Auth required' },
  { key: 'scanLimited', label: 'Scan limited' },
];

const formatCount = (value) => new Intl.NumberFormat().format(Math.max(0, Number(value || 0) || 0));

const formatDuration = (seconds) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0) || 0));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const getFallbackEstimateSeconds = (elapsedSeconds) => {
  if (elapsedSeconds < 60) return 60;
  return Math.max(300, Math.ceil(elapsedSeconds / 300) * 300);
};

const getTimeEstimateSeconds = ({ elapsedSeconds, scannedCount, queuedCount }) => {
  if (scannedCount > 2 && queuedCount > 0) {
    const avgTimePerPage = elapsedSeconds / scannedCount;
    return Math.max(elapsedSeconds, Math.ceil(elapsedSeconds + (avgTimePerPage * queuedCount)));
  }
  return getFallbackEstimateSeconds(elapsedSeconds);
};

const ScanProgressModal = ({
  loading,
  showCancelConfirm,
  showStopConfirm,
  isStoppingScan,
  scanErrorMessage,
  scanMessage,
  scanProgress,
  scanLimitNote,
  scanElapsed,
  urlInput,
  onRequestStop,
  onRequestCancel,
  onStopScan,
  onCancelScan,
  onContinueScan,
  onDismissScanError,
}) => {
  if (!loading && !scanErrorMessage) return null;
  const scannedCount = Math.max(0, Number(scanProgress.scanned || 0) || 0);
  const mappedCount = Number.isFinite(Number(scanProgress.mapped))
    ? Math.max(0, Number(scanProgress.mapped || 0) || 0)
    : null;
  const queuedCount = Math.max(0, Number(scanProgress.queued || 0) || 0);
  const primaryCount = mappedCount === null ? scannedCount : mappedCount;
  const primaryLabel = mappedCount === null ? 'Scanned' : 'Captured';
  const hasQueue = queuedCount > 0;
  const pageTotal = Math.max(primaryCount, primaryCount + queuedCount);
  const pagePercent = pageTotal > 0 ? Math.min(100, Math.round((primaryCount / pageTotal) * 100)) : 0;
  const elapsedSeconds = Math.max(0, Math.floor(Number(scanElapsed || 0) || 0));
  const estimatedTotalSeconds = getTimeEstimateSeconds({ elapsedSeconds, scannedCount, queuedCount });
  const timePercent = estimatedTotalSeconds > 0
    ? Math.min(100, Math.max(0, (elapsedSeconds / estimatedTotalSeconds) * 100))
    : 0;
  const findingCounts = scanProgress.findings || {};
  const findingItems = FINDING_ITEMS
    .map((item) => ({
      ...item,
      count: Math.max(0, Number(findingCounts[item.key] || 0) || 0),
    }))
    .filter((item) => item.count > 0);
  const totalFindings = Math.max(
    0,
    Number(scanProgress.totalFindings || findingItems.reduce((sum, item) => sum + item.count, 0)) || 0
  );
  const displayMessage = isStoppingScan
    ? 'Stopping scan and preparing current results...'
    : scanMessage;

  let body = null;
  let footer = null;

  if (scanErrorMessage) {
    body = (
      <div className="cancel-confirm scan-error-state">
        <AlertTriangle size={48} className="cancel-warning-icon scan-error-icon" />
        <h3>Scan failed</h3>
        <p>{scanErrorMessage}</p>
      </div>
    );
    footer = (
      <Button variant="primary" onClick={onDismissScanError}>
        Close
      </Button>
    );
  } else if (!showCancelConfirm && !showStopConfirm) {
    body = (
      <>
        <div className="scan-status">
          <div className="scan-message">{displayMessage}</div>
          <div className="scan-url">{urlInput}</div>

          <div className="scan-time-chart" role="img" aria-label={`Elapsed ${formatDuration(elapsedSeconds)} of estimated ${formatDuration(estimatedTotalSeconds)}`}>
            <div
              className="scan-time-donut"
              style={{ '--scan-time-progress': `${timePercent}%` }}
              aria-hidden="true"
            />
            <div className="scan-time-center">
              <span className="scan-time-value">{formatDuration(elapsedSeconds)}</span>
              <span className="scan-time-label scan-time-label--elapsed">Elapsed</span>
              <span className="scan-time-separator" aria-hidden="true" />
              <span className="scan-time-label scan-time-label--estimate">Est. total</span>
              <span className="scan-time-total">{formatDuration(estimatedTotalSeconds)}</span>
            </div>
          </div>

          <div className="scan-chart-section scan-chart-section--pages">
            <div className="scan-chart-heading">
              <span>Pages {primaryLabel.toLowerCase()}</span>
              <span>
                <strong>{formatCount(primaryCount)} of {formatCount(pageTotal)}</strong>
                {pageTotal > 0 ? (
                  <span className="scan-inline-note">({pagePercent}%)</span>
                ) : null}
              </span>
            </div>
            <div className="scan-progress-track" role="img" aria-label={`${formatCount(primaryCount)} of ${formatCount(pageTotal)} pages ${primaryLabel.toLowerCase()}`}>
              <span
                className="scan-progress-fill"
                style={{ width: `${pagePercent}%` }}
              />
            </div>
            {hasQueue ? (
              <div className="scan-queue-note">
                <span>{formatCount(queuedCount)}</span>
                <span>in queue</span>
              </div>
            ) : null}
          </div>

          <div className="scan-chart-section scan-chart-section--findings">
            <div className="scan-chart-heading">
              <span>Findings</span>
              <span>
                <strong>{formatCount(totalFindings)}</strong>
                <span className="scan-inline-note">issues</span>
              </span>
            </div>
            {findingItems.length ? (
              <>
                <div className="scan-findings-bar" role="img" aria-label={`${formatCount(totalFindings)} issues found`}>
                  {findingItems.map((item) => (
                    <span
                      key={item.key}
                      className={`scan-findings-segment scan-findings-segment--${item.key}`}
                      style={{ width: `${(item.count / totalFindings) * 100}%` }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <div className="scan-findings-list">
                  {findingItems.map((item) => (
                    <div key={item.key} className="scan-finding-item">
                      <span className={`scan-finding-dot scan-finding-dot--${item.key}`} aria-hidden="true" />
                      <span>{item.label}</span>
                      <strong>{formatCount(item.count)}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="scan-findings-empty">No findings yet</div>
            )}
          </div>

          {scanLimitNote ? (
            <p className="scan-limit-note">{scanLimitNote}</p>
          ) : null}
        </div>
      </>
    );
    footer = (
      <>
        <Button
          variant="secondary"
          onClick={onRequestCancel}
          disabled={isStoppingScan}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={onRequestStop}
          loading={isStoppingScan}
        >
          {isStoppingScan ? 'Stopping...' : 'Stop'}
        </Button>
      </>
    );
  } else if (showCancelConfirm) {
    body = (
      <div className="cancel-confirm">
        <AlertTriangle size={48} className="cancel-warning-icon" />
        <h3>Cancel scan?</h3>
        <p>Are you sure you want to cancel the current scan?</p>
      </div>
    );
    footer = (
      <>
        <Button
          variant="secondary"
          buttonStyle="mono"
          onClick={onContinueScan}
          disabled={isStoppingScan}
        >
          No, continue scanning
        </Button>
        <Button variant="danger" onClick={onCancelScan}>
          Yes, cancel scan
        </Button>
      </>
    );
  } else {
    body = (
      <div className="cancel-confirm">
        <AlertTriangle size={48} className="cancel-warning-icon" />
        <h3>Stop scanning?</h3>
        <p>Stop scanning and show the pages captured so far?</p>
      </div>
    );
    footer = (
      <>
        <Button
          variant="secondary"
          onClick={onContinueScan}
          disabled={isStoppingScan}
        >
          Cancel
        </Button>
        <Button variant="primary" onClick={onStopScan} disabled={isStoppingScan}>
          Stop
        </Button>
      </>
    );
  }

  return (
    <Modal
      show
      onClose={() => {}}
      hideCloseButton
      className="scanning-modal"
      bodyClassName="scanning-modal-body"
      footer={footer}
    >
      {body}
    </Modal>
  );
};

export default ScanProgressModal;
