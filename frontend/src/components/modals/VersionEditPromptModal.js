import React from 'react';

import Button from '../ui/Button';
import Modal from '../ui/Modal';

const VersionEditPromptModal = ({
  show,
  onSaveCopy,
  onOverride,
}) => {
  if (!show) return null;

  return (
    <Modal
      show={show}
      onClose={onOverride}
      title="Edit Older Version?"
      size="md"
      className="version-edit-modal"
      hideCloseButton
      footer={(
        <>
          <Button variant="secondary" onClick={onOverride}>
            Override Latest
          </Button>
          <Button variant="primary" onClick={onSaveCopy}>
            Save as Copy
          </Button>
        </>
      )}
    >
      <p className="version-edit-text">
        You’re editing a previous version. Do you want to save these changes as a copy
        or override the latest map?
      </p>
    </Modal>
  );
};

export default VersionEditPromptModal;
