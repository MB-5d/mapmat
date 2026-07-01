import React from 'react';
import { FileUp, Loader2 } from 'lucide-react';

import Modal from '../ui/Modal';

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
    <Modal
      show={show}
      onClose={onClose}
      title="Import sitemap"
      scrollable
      className="import-modal"
    >
      <div className="import-info">
        <p>Import a sitemap from a file. Supported formats:</p>
        <ul className="import-formats">
          <li><strong>JSON</strong> - Exact Vellic map backup</li>
          <li><strong>XML</strong> - Standard sitemap.xml files</li>
          <li><strong>RSS/Atom</strong> - Feed files with links</li>
          <li><strong>HTML</strong> - Nested links, tables, or page links</li>
          <li><strong>CSV</strong> - Spreadsheet sitemap files</li>
          <li><strong>Markdown</strong> - Nested links or readable site indexes</li>
          <li><strong>TXT</strong> - URL lists or text indexes</li>
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
          accept=".json,.xml,.rss,.atom,.html,.htm,.csv,.md,.markdown,.txt"
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
            <span className="import-hint">.json, .xml, .rss, .atom, .html, .csv, .md, .txt</span>
          </>
        )}
      </label>
    </Modal>
  );
};

export default ImportModal;
