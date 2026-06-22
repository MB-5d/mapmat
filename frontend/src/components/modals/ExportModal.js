import React from 'react';
import { File, FileCode, FileImage, FileJson, FileSpreadsheet, FileText, FileType, List, Sparkles } from 'lucide-react';

import Button from '../ui/Button';
import Modal from '../ui/Modal';
import OptionCard from '../ui/OptionCard';

const INDEX_FORMAT_OPTIONS = [
  { format: 'doc', label: 'Doc', icon: File },
  { format: 'txt', label: 'Plain text', icon: FileText },
  { format: 'html', label: 'HTML', icon: FileCode },
  { format: 'md', label: 'Markdown', icon: FileType },
];

const ExportModal = ({
  show,
  onClose,
  onExportPng,
  onExportPdf,
  onExportCsv,
  onExportJson,
  onExportXml,
  onExportSiteIndex,
  onExportAiSiteBrief,
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
          icon={<Sparkles size={24} />}
          title="AI brief"
          description="Site-building brief for AI code tools"
          onClick={onExportAiSiteBrief}
        />
        <OptionCard
          className="export-btn"
          icon={<FileText size={24} />}
          title="PDF"
          description="Visual sitemap in vector"
          onClick={onExportPdf}
        />
        <OptionCard
          className="export-btn"
          icon={<FileImage size={24} />}
          title="Image"
          description="High resolution snapshot with transparency"
          onClick={onExportPng}
        />
        <OptionCard
          className="export-btn"
          icon={<FileSpreadsheet size={24} />}
          title="CSV"
          description="All your sitemap data in a spreadsheet"
          onClick={onExportCsv}
        />
        <OptionCard
          className="export-btn"
          icon={<FileJson size={24} />}
          title="JSON"
          description="Raw data for import or backup"
          onClick={onExportJson}
        />
        <OptionCard
          className="export-btn"
          icon={<FileCode size={24} />}
          title="XML"
          description="Sitemap XML URL list"
          onClick={onExportXml}
        />
        <OptionCard
          as="div"
          className="export-btn export-btn-index"
          icon={<List size={24} />}
          title="Index"
          description="Formatted document of page list with links"
        >
          <span className="export-index-format-actions" aria-label="Index export formats">
            {INDEX_FORMAT_OPTIONS.map(({ format, label, icon: IconComponent }) => (
              <Button
                key={format}
                type="link"
                size="sm"
                startIcon={<IconComponent size={16} />}
                onClick={() => onExportSiteIndex(format)}
              >
                {label}
              </Button>
            ))}
          </span>
        </OptionCard>
      </div>
    </Modal>
  );
};

export default ExportModal;
