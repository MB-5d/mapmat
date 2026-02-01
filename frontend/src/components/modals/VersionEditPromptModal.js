import React from 'react';

const VersionEditPromptModal = ({
  show,
  onSaveCopy,
  onOverride,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-md version-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Older Version?</h3>
        </div>
        <div className="modal-body">
          <p className="version-edit-text">
            You’re editing a previous version. Do you want to save these changes as a copy
            or override the latest map?
          </p>
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onOverride}>
            Override Latest
          </button>
          <button className="modal-btn primary" onClick={onSaveCopy}>
            Save as Copy
          </button>
        </div>
      </div>
    </div>
  );
};

export default VersionEditPromptModal;
