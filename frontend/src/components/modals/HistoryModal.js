import React from 'react';
import { CheckSquare, Globe, Square, Trash2, X } from 'lucide-react';

const HistoryModal = ({
  show,
  onClose,
  scanHistory,
  selectedHistoryItems,
  onToggleSelection,
  onSelectAllToggle,
  onDeleteSelected,
  onLoadFromHistory,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Scan History</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        {scanHistory.length === 0 ? (
          <div className="history-empty">
            No scans in history yet. Your completed scans will appear here.
          </div>
        ) : (
          <>
            <div className="history-actions">
              <button
                className="history-action-btn"
                onClick={onSelectAllToggle}
              >
                {selectedHistoryItems.size === scanHistory.length ? (
                  <><CheckSquare size={16} /> Deselect All</>
                ) : (
                  <><Square size={16} /> Select All</>
                )}
              </button>
              {selectedHistoryItems.size > 0 && (
                <button className="history-action-btn danger" onClick={onDeleteSelected}>
                  <Trash2 size={16} />
                  Delete Selected ({selectedHistoryItems.size})
                </button>
              )}
            </div>
            <div className="history-list">
              {scanHistory.map(item => (
                <div
                  key={item.id}
                  className={`history-item ${selectedHistoryItems.has(item.id) ? 'selected' : ''}`}
                >
                  <button
                    className="history-checkbox"
                    onClick={(e) => { e.stopPropagation(); onToggleSelection(item.id); }}
                  >
                    {selectedHistoryItems.has(item.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                  <div className="history-item-content" onClick={() => onLoadFromHistory(item)}>
                    <div className="history-item-header">
                      <Globe size={16} />
                      <span className="history-hostname">{item.hostname}</span>
                      <span className="history-pages">{item.page_count || item.pageCount} pages</span>
                    </div>
                    <div className="history-item-meta">
                      <span className="history-url">{item.url}</span>
                      <span className="history-date">{new Date(item.scanned_at || item.scannedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HistoryModal;
