import React from 'react';
import { FileImage, FileJson, FileSpreadsheet, FileText, List, X } from 'lucide-react';

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Download</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-options">
            <button className="modal-option-card" onClick={onExportPng}>
              <FileImage size={24} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">PNG Image</span>
                <span className="modal-option-desc">Visual sitemap for presentations</span>
              </div>
            </button>
            <button className="modal-option-card" onClick={onExportPdf}>
              <FileText size={24} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">PDF Document</span>
                <span className="modal-option-desc">Printable report with page list</span>
              </div>
            </button>
            <button className="modal-option-card" onClick={onExportCsv}>
              <FileSpreadsheet size={24} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">CSV Spreadsheet</span>
                <span className="modal-option-desc">Page data for Excel or Google Sheets</span>
              </div>
            </button>
            <button className="modal-option-card" onClick={onExportJson}>
              <FileJson size={24} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">JSON Data</span>
                <span className="modal-option-desc">Raw data for import or backup</span>
              </div>
            </button>
            <button className="modal-option-card" onClick={onExportSiteIndex}>
              <List size={24} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">Site Index</span>
                <span className="modal-option-desc">Page list document for Word or Google Docs</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
