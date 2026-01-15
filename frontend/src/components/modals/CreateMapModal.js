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
      <div className="modal create-map-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Map</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="create-map-options">
            <button
              className="create-map-option"
              onClick={() => {
                onClose();
                onStartFromScratch();
              }}
            >
              <FileText size={24} />
              <div className="create-map-option-text">
                <span className="create-map-option-title">Start from Scratch</span>
                <span className="create-map-option-desc">Begin with a blank canvas</span>
              </div>
            </button>

            <button className="create-map-option disabled" disabled>
              <LayoutTemplate size={24} />
              <div className="create-map-option-text">
                <span className="create-map-option-title">Start from Template</span>
                <span className="create-map-option-desc">Product, Ecommerce, Blog...</span>
              </div>
              <span className="coming-soon-badge">Coming Soon</span>
            </button>

            <button
              className="create-map-option"
              onClick={() => {
                onClose();
                onImportFromFile();
              }}
            >
              <Upload size={24} />
              <div className="create-map-option-text">
                <span className="create-map-option-title">Import from File</span>
                <span className="create-map-option-desc">XML sitemap, CSV, JSON</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateMapModal;