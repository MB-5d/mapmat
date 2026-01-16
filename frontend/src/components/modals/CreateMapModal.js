import React from 'react';
import { FileText, LayoutTemplate, Upload, X } from 'lucide-react';

const CreateMapModal = ({
  show,
  onClose,
  onStartFromScratch,
  onImportFromFile
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Map</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-options">
            <button
              className="modal-option-card"
              onClick={() => {
                onClose();
                onStartFromScratch();
              }}
            >
              <FileText size={24} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">Start from Scratch</span>
                <span className="modal-option-desc">Begin with a blank canvas</span>
              </div>
            </button>

            <button className="modal-option-card disabled" disabled>
              <LayoutTemplate size={24} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">Start from Template</span>
                <span className="modal-option-desc">Product, Ecommerce, Blog...</span>
              </div>
              <span className="modal-option-badge">Coming Soon</span>
            </button>

            <button
              className="modal-option-card"
              onClick={() => {
                onClose();
                onImportFromFile();
              }}
            >
              <Upload size={24} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">Import from File</span>
                <span className="modal-option-desc">XML sitemap, CSV, JSON</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateMapModal;