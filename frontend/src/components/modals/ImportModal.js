import React from 'react';
import { FileUp, Loader2, X } from 'lucide-react';

const ImportModal = ({
  show,
  onClose,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileChange,
  loading,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card import-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import Sitemap</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="import-info">
            <p>Import a sitemap from a file. Supported formats:</p>
            <ul className="import-formats">
              <li><strong>XML</strong> - Standard sitemap.xml files</li>
              <li><strong>RSS/Atom</strong> - Feed files with links</li>
              <li><strong>HTML</strong> - Extracts all links from the page</li>
              <li><strong>CSV</strong> - Comma-separated URLs</li>
              <li><strong>Markdown</strong> - Extracts URLs from markdown</li>
              <li><strong>TXT</strong> - Plain text with URLs</li>
            </ul>
          </div>
          <label
            className="import-dropzone"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <input
              type="file"
              accept=".xml,.rss,.atom,.html,.htm,.csv,.md,.markdown,.txt"
              onChange={onFileChange}
              disabled={loading}
            />
            {loading ? (
              <div className="import-loading">
                <Loader2 size={32} className="spin" />
                <span>Processing file...</span>
              </div>
            ) : (
              <>
                <FileUp size={48} />
                <span>Click to select file or drag and drop</span>
                <span className="import-hint">.xml, .rss, .atom, .html, .csv, .md, .txt</span>
              </>
            )}
          </label>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
