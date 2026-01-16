import React from 'react';
import { X } from 'lucide-react';

const DeleteConfirmModal = ({ node, onCancel, onConfirm }) => {
  if (!node) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Delete Page</h3>
          <button className="modal-close" onClick={onCancel}>
            <X size={24} />
          </button>
        </div>
        <p>Delete "{node.title || node.url || 'this page'}"?</p>
        <div className="confirm-modal-actions">
          <button className="modal-btn secondary" onClick={onCancel}>Cancel</button>
          <button className="modal-btn danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;