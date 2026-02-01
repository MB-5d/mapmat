import React, { useEffect, useState } from 'react';
import { BookmarkPlus, X } from 'lucide-react';

const SaveVersionModal = ({
  show,
  onClose,
  onSave,
  versionNumber,
  timestamp,
  defaultName = 'Updated',
}) => {
  const [name, setName] = useState(defaultName);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!show) return;
    setName(defaultName);
    setNotes('');
  }, [show, defaultName]);

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-md save-version-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Save Version</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          <div className="version-meta-row">
            <div className="version-meta-pill">
              <BookmarkPlus size={14} />
              <span>v{versionNumber}</span>
            </div>
            <div className="version-meta-date">{timestamp}</div>
          </div>

          <div className="form-group">
            <label>Title (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Updated"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add context or details…"
              rows={4}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn primary"
            onClick={() => onSave(name.trim(), notes.trim())}
          >
            Save Version
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveVersionModal;
