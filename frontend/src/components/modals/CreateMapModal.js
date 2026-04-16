import React from 'react';
import { FileText, LayoutTemplate, Upload } from 'lucide-react';

import Modal from '../ui/Modal';

const CreateMapModal = ({
  show,
  onClose,
  onStartFromScratch,
  onImportFromFile
}) => {
  if (!show) return null;

  return (
    <Modal
      show={show}
      onClose={onClose}
      title="Create New Map"
      scrollable
      className="create-map-modal"
    >
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
    </Modal>
  );
};

export default CreateMapModal;
