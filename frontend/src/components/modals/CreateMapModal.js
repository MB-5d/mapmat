import React from 'react';
import { FileText, LayoutTemplate, Upload } from 'lucide-react';

import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import OptionCard from '../ui/OptionCard';

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
        <OptionCard
          className="create-map-option"
          icon={<FileText size={24} />}
          title="Start from Scratch"
          description="Begin with a blank canvas"
          onClick={() => {
            onClose();
            onStartFromScratch();
          }}
        />

        <OptionCard
          className="create-map-option disabled"
          icon={<LayoutTemplate size={24} />}
          title="Start from Template"
          description="Product, Ecommerce, Blog..."
          badge={<Badge className="coming-soon-badge" label="Coming Soon" />}
          disabled
        />

        <OptionCard
          className="create-map-option"
          icon={<Upload size={24} />}
          title="Import from File"
          description="XML sitemap, CSV, JSON"
          onClick={() => {
            onClose();
            onImportFromFile();
          }}
        />
      </div>
    </Modal>
  );
};

export default CreateMapModal;
