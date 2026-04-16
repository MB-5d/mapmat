import React from 'react';
import { FileImage, FileJson, FileSpreadsheet, FileText, List } from 'lucide-react';

import Modal from '../ui/Modal';
import OptionCard from '../ui/OptionCard';

const ExportModal = ({
  show,
  onClose,
  onExportPng,
  onExportPdf,
  onExportCsv,
  onExportJson,
  onExportSiteIndex,
}) => {
  if (!show) return null;

  return (
    <Modal
      show={show}
      onClose={onClose}
      title="Download"
      scrollable
      className="export-modal"
    >
      <div className="export-options">
        <OptionCard
          className="export-btn"
          icon={<FileImage size={24} />}
          title="PNG Image"
          description="Visual sitemap for presentations"
          onClick={onExportPng}
        />
        <OptionCard
          className="export-btn"
          icon={<FileText size={24} />}
          title="PDF Document"
          description="Printable report with page list"
          onClick={onExportPdf}
        />
        <OptionCard
          className="export-btn"
          icon={<FileSpreadsheet size={24} />}
          title="CSV Spreadsheet"
          description="Page data for Excel or Google Sheets"
          onClick={onExportCsv}
        />
        <OptionCard
          className="export-btn"
          icon={<FileJson size={24} />}
          title="JSON Data"
          description="Raw data for import or backup"
          onClick={onExportJson}
        />
        <OptionCard
          className="export-btn"
          icon={<List size={24} />}
          title="Site Index"
          description="Page list document for Word or Google Docs"
          onClick={onExportSiteIndex}
        />
      </div>
    </Modal>
  );
};

export default ExportModal;
