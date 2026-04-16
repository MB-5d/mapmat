import React from 'react';
import { FileImage, FileJson, FileSpreadsheet, FileText, List } from 'lucide-react';

import Modal from '../ui/Modal';

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
        <button className="export-btn" onClick={onExportPng}>
          <FileImage size={24} />
          <div className="export-btn-text">
            <span className="export-btn-title">PNG Image</span>
            <span className="export-btn-desc">Visual sitemap for presentations</span>
          </div>
        </button>
        <button className="export-btn" onClick={onExportPdf}>
          <FileText size={24} />
          <div className="export-btn-text">
            <span className="export-btn-title">PDF Document</span>
            <span className="export-btn-desc">Printable report with page list</span>
          </div>
        </button>
        <button className="export-btn" onClick={onExportCsv}>
          <FileSpreadsheet size={24} />
          <div className="export-btn-text">
            <span className="export-btn-title">CSV Spreadsheet</span>
            <span className="export-btn-desc">Page data for Excel or Google Sheets</span>
          </div>
        </button>
        <button className="export-btn" onClick={onExportJson}>
          <FileJson size={24} />
          <div className="export-btn-text">
            <span className="export-btn-title">JSON Data</span>
            <span className="export-btn-desc">Raw data for import or backup</span>
          </div>
        </button>
        <button className="export-btn" onClick={onExportSiteIndex}>
          <List size={24} />
          <div className="export-btn-text">
            <span className="export-btn-title">Site Index</span>
            <span className="export-btn-desc">Page list document for Word or Google Docs</span>
          </div>
        </button>
      </div>
    </Modal>
  );
};

export default ExportModal;
