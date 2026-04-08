import React from 'react';
import { AlertTriangle, Globe, Loader2 } from 'lucide-react';

import { APP_ONLY_MODE, SCAN_MAX_PAGES_UI } from '../../utils/constants';

const ScanProgressModal = ({
  loading,
  showCancelConfirm,
  isStoppingScan,
  scanMessage,
  scanProgress,
  scanElapsed,
  urlInput,
  onRequestCancel,
  onStopScan,
  onCancelScan,
  onContinueScan,
}) => {
  if (!loading) return null;
  const hasQueue = scanProgress.queued > 0;
  const displayMessage = isStoppingScan
    ? 'Stopping scan and preparing current results...'
    : scanMessage;

  return (
    <div className="modal-overlay scanning-overlay">
      <div className="modal-card scanning-modal" onClick={(e) => e.stopPropagation()}>
        {!showCancelConfirm ? (
          <>
            <div className="scan-animation">
              <Globe size={48} className="scan-globe" />
              <Loader2 size={80} className="scan-spinner" />
            </div>
            <div className="scan-status">
              <div className="scan-message">{displayMessage}</div>
              <div className="scan-url">{urlInput}</div>
              {APP_ONLY_MODE ? (
                <div className="scan-limit-note">
                  Limited to {SCAN_MAX_PAGES_UI} pages during testing
                </div>
              ) : null}
              <div className={`scan-stats${hasQueue ? '' : ' single'}`}>
                <div className="scan-pages">
                  <span className="scan-pages-count">{scanProgress.scanned}</span>
                  <span className="scan-pages-label">Scanned</span>
                </div>
                {hasQueue && (
                  <div className="scan-queued">
                    <span className="scan-queued-count">{scanProgress.queued}</span>
                    <span className="scan-queued-label">In queue</span>
                  </div>
                )}
              </div>
              <div className="scan-stats-divider" aria-hidden="true" />
              <div className="scan-time-info">
                <div className="scan-elapsed">
                  <span className="scan-time-label">Elapsed</span>
                  <span className="scan-time-value">
                    {Math.floor(scanElapsed / 60)}:{String(scanElapsed % 60).padStart(2, '0')}
                  </span>
                </div>
                <div className="scan-time-divider" aria-hidden="true" />
                {scanProgress.scanned > 2 && hasQueue && (
                  <div className="scan-estimated">
                    <span className="scan-time-label">Remaining</span>
                    <span className="scan-time-value">
                      {(() => {
                        const avgTimePerPage = scanElapsed / scanProgress.scanned;
                        const estRemaining = Math.ceil(avgTimePerPage * scanProgress.queued);
                        const mins = Math.floor(estRemaining / 60);
                        const secs = estRemaining % 60;
                        return `~${mins}:${String(secs).padStart(2, '0')}`;
                      })()}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              className="modal-btn secondary"
              onClick={onRequestCancel}
              disabled={isStoppingScan}
            >
              {isStoppingScan ? 'Preparing current results...' : 'Stop or Cancel Scan'}
            </button>
          </>
        ) : (
          <>
            <div className="cancel-confirm">
              <AlertTriangle size={48} className="cancel-warning-icon" />
              <h3>Stop Scan?</h3>
              <p>Choose whether to show the current results, discard them, or keep scanning.</p>
            </div>
            <div className="cancel-actions">
              <button className="modal-btn primary" onClick={onStopScan} disabled={isStoppingScan}>
                Stop and Show Current Results
              </button>
              <button className="modal-btn danger" onClick={onCancelScan} disabled={isStoppingScan}>
                Cancel and Discard
              </button>
              <button
                className="modal-btn secondary"
                onClick={onContinueScan}
                disabled={isStoppingScan}
              >
                Keep Scanning
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ScanProgressModal;
