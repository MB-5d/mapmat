import React from 'react';
import { AlertTriangle, Globe, Loader2 } from 'lucide-react';

import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { APP_ONLY_MODE, SCAN_MAX_PAGES_UI } from '../../utils/constants';

const ScanProgressModal = ({
  loading,
  showCancelConfirm,
  showStopConfirm,
  isStoppingScan,
  scanErrorMessage,
  scanMessage,
  scanProgress,
  scanElapsed,
  urlInput,
  onRequestCancel,
  onRequestStop,
  onStopScan,
  onCancelScan,
  onContinueScan,
  onDismissScanError,
}) => {
  if (!loading && !scanErrorMessage) return null;
  const hasQueue = scanProgress.queued > 0;
  const displayMessage = isStoppingScan
    ? 'Stopping scan and preparing current results...'
    : scanMessage;

  return (
    <Modal
      show
      onClose={() => {}}
      hideCloseButton
      className="scanning-modal"
      bodyClassName="scanning-modal-body"
    >
        {scanErrorMessage ? (
          <>
            <div className="cancel-confirm scan-error-state">
              <AlertTriangle size={48} className="cancel-warning-icon scan-error-icon" />
              <h3>Scan Failed</h3>
              <p>{scanErrorMessage}</p>
            </div>
            <div className="cancel-actions">
              <Button variant="primary" onClick={onDismissScanError}>
                Close
              </Button>
            </div>
          </>
        ) : !showCancelConfirm && !showStopConfirm ? (
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
            <div className="scan-actions">
              <Button
                variant="secondary"
                onClick={onRequestCancel}
                disabled={isStoppingScan}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={onRequestStop}
                loading={isStoppingScan}
              >
                {isStoppingScan ? 'Stopping...' : 'Stop'}
              </Button>
            </div>
          </>
        ) : showCancelConfirm ? (
          <>
            <div className="cancel-confirm">
              <AlertTriangle size={48} className="cancel-warning-icon" />
              <h3>Cancel Scan?</h3>
              <p>Are you sure you want to cancel the current scan?</p>
            </div>
            <div className="cancel-actions">
              <Button variant="danger" onClick={onCancelScan} disabled={isStoppingScan}>
                Yes, Cancel Scan
              </Button>
              <Button
                variant="secondary"
                onClick={onContinueScan}
                disabled={isStoppingScan}
              >
                No, Continue Scanning
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="cancel-confirm">
              <AlertTriangle size={48} className="cancel-warning-icon" />
              <h3>Stop Scanning?</h3>
              <p>Stop scanning and show current progress?</p>
            </div>
            <div className="cancel-actions">
              <Button variant="primary" onClick={onStopScan} disabled={isStoppingScan}>
                Yes
              </Button>
              <Button
                variant="secondary"
                onClick={onContinueScan}
                disabled={isStoppingScan}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
    </Modal>
  );
};

export default ScanProgressModal;
