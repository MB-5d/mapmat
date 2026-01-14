import React from 'react';

const DeleteConfirmModal = ({ node, onCancel, onConfirm }) => {
  if (!node) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Delete Page</h3>
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
