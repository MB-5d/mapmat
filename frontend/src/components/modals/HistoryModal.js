import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, Globe, Square, Trash2 } from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';

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
  const [sortOrder, setSortOrder] = useState('newest');
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      selectedHistoryItems.size > 0 && selectedHistoryItems.size < scanHistory.length;
  }, [selectedHistoryItems, scanHistory.length]);

  const sortedHistory = useMemo(() => {
    const items = [...scanHistory];
    return items.sort((a, b) => {
      const aDate = new Date(a.scanned_at || a.scannedAt || 0).getTime();
      const bDate = new Date(b.scanned_at || b.scannedAt || 0).getTime();
      return sortOrder === 'newest' ? bDate - aDate : aDate - bDate;
    });
  }, [scanHistory, sortOrder]);

  return (
    <AccountDrawer
      isOpen={show}
      onClose={onClose}
      title="History"
      subtitle="Scan History"
      className="history-drawer"
    >
      <div className="history-modal">
        <div className="modal-body">
          {scanHistory.length === 0 ? (
            <div className="history-empty">
              No scans in history yet. Your completed scans will appear here.
            </div>
          ) : (
            <>
              <div className="history-actions">
                <div className="history-actions-left">
                  <label className="history-select-all">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={scanHistory.length > 0 && selectedHistoryItems.size === scanHistory.length}
                      onChange={onSelectAllToggle}
                    />
                    <span>Select all</span>
                  </label>
                  {selectedHistoryItems.size > 0 && (
                    <button className="history-action-btn danger" onClick={onDeleteSelected}>
                      <Trash2 size={16} />
                      Delete Selected ({selectedHistoryItems.size})
                    </button>
                  )}
                </div>
                <div className="history-actions-right">
                  <div className="history-sort">
                    <span>Sort</span>
                    <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="history-list">
                {sortedHistory.map(item => (
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
                    <div
                      className="history-item-content"
                      onClick={() => onLoadFromHistory?.(item)}
                      role={onLoadFromHistory ? 'button' : undefined}
                    >
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
    </AccountDrawer>
  );
};

export default HistoryModal;
