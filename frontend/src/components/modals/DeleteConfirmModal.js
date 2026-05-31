import React from 'react';

import Button from '../ui/Button';
import Modal from '../ui/Modal';

const DeleteConfirmModal = ({ node, onCancel, onConfirm }) => {
  if (!node) return null;

  return (
    <Modal
      show={!!node}
      onClose={onCancel}
      title="Delete Page"
      size="sm"
      className="confirm-modal"
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Delete</Button>
        </>
      )}
    >
      <p>Delete "{node.title || node.url || 'this page'}"?</p>
    </Modal>
  );
};

export default DeleteConfirmModal;
