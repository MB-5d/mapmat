import React from 'react';
import { AlertTriangle, Globe, Loader2 } from 'lucide-react';

const ScanProgressModal = ({
  loading,
  showCancelConfirm,
  scanMessage,
  scanProgress,
  scanElapsed,
  urlInput,
  onRequestCancel,
  onCancelScan,
  onContinueScan,
}) => {
  if (!loading) return null;

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
              <div className="scan-message">{scanMessage}</div>
              <div className="scan-stats">
                <div className="scan-pages">
                  <span className="scan-pages-count">{scanProgress.scanned}</span>
                  <span className="scan-pages-label">pages scanned</span>
                </div>
                {scanProgress.queued > 0 && (
                  <div className="scan-queued">
                    <span className="scan-queued-count">{scanProgress.queued}</span>
                    <span className="scan-queued-label">in queue</span>
                  </div>
                )}
              </div>
              <div className="scan-time-info">
                <div className="scan-elapsed">
                  <span className="scan-time-label">Elapsed</span>
                  <span className="scan-time-value">
                    {Math.floor(scanElapsed / 60)}:{String(scanElapsed % 60).padStart(2, '0')}
                  </span>
                </div>
                {scanProgress.scanned > 2 && scanProgress.queued > 0 && (
                  <div className="scan-estimated">
                    <span className="scan-time-label">Est. remaining</span>
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
            <div className="scan-url">{urlInput}</div>
            <button
              className="modal-btn cancel"
              onClick={onRequestCancel}
            >
              Cancel Scan
            </button>
          </>
        ) : (
          <>
            <div className="cancel-confirm">
              <AlertTriangle size={48} className="cancel-warning-icon" />
              <h3>Cancel Scan?</h3>
              <p>Are you sure you want to cancel the current scan?</p>
            </div>
            <div className="cancel-actions">
              <button className="modal-btn danger" onClick={onCancelScan}>
                Yes, Cancel Scan
              </button>
              <button
                className="modal-btn secondary"
                onClick={onContinueScan}
              >
                No, Continue Scanning
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ScanProgressModal;
