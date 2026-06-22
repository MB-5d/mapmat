import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpToLine, CheckSquare, Globe, Square, Trash2 } from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import SelectInput from '../ui/SelectInput';

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
  const [showBackToTop, setShowBackToTop] = useState(false);
  const selectAllRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      selectedHistoryItems.size > 0 && selectedHistoryItems.size < scanHistory.length;
  }, [selectedHistoryItems, scanHistory.length]);

  const sortedHistory = useMemo(() => {
    const items = [...scanHistory];
    return items.sort((a, b) => {
      if (sortOrder === 'pageCount') {
        const aPageCount = Number(a.page_count || a.pageCount || 0);
        const bPageCount = Number(b.page_count || b.pageCount || 0);
        return bPageCount - aPageCount;
      }
      const aDate = new Date(a.scanned_at || a.scannedAt || 0).getTime();
      const bDate = new Date(b.scanned_at || b.scannedAt || 0).getTime();
      return sortOrder === 'newest' ? bDate - aDate : aDate - bDate;
    });
  }, [scanHistory, sortOrder]);

  const handleListScroll = (event) => {
    setShowBackToTop(event.currentTarget.scrollTop > 240);
  };

  const scrollToTop = () => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AccountDrawer
      isOpen={show}
      onClose={onClose}
      title="Scan history"
      className="history-drawer"
    >
      <section className="history-modal">
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
                    <IconButton
                      className="history-delete-selected-btn"
                      variant="danger"
                      size="sm"
                      icon={<Trash2 />}
                      label={`Delete selected (${selectedHistoryItems.size})`}
                      title={`Delete selected (${selectedHistoryItems.size})`}
                      onClick={onDeleteSelected}
                    />
                  )}
                </div>
                <div className="history-actions-right">
                  <div className="history-sort">
                    <span>Sort</span>
                    <SelectInput size="sm" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="pageCount">Page count</option>
                    </SelectInput>
                  </div>
                </div>
              </div>
              <div className="history-list" ref={listRef} onScroll={handleListScroll}>
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
                {showBackToTop ? (
                  <Button
                    type="primary"
                    buttonStyle="mono"
                    size="sm"
                    className="drawer-back-to-top"
                    onClick={scrollToTop}
                    startIcon={<ArrowUpToLine />}
                  >
                    Back to top
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>
    </AccountDrawer>
  );
};

export default HistoryModal;
