import React, { useEffect, useState } from 'react';
import { FileText, FileUp, Link2, Loader2 } from 'lucide-react';

import Button from '../ui/Button';
import Modal from '../ui/Modal';
import RadioCardGroup from '../ui/RadioCardGroup';
import SegmentedControl from '../ui/SegmentedControl';
import TextareaInput from '../ui/TextareaInput';
import { IMPORT_MODES } from '../../utils/importParsers';

const IMPORT_TABS = [
  { value: 'upload', label: 'Upload file', icon: <FileUp size={16} /> },
  { value: 'paste', label: 'Paste URLs', icon: <Link2 size={16} /> },
];

const ImportModal = ({
  show,
  onClose,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileChange,
  onPasteReview,
  onImport,
  onReset,
  loading,
  preview,
}) => {
  const [tab, setTab] = useState('upload');
  const [pasteText, setPasteText] = useState('');
  const [mode, setMode] = useState(IMPORT_MODES.PROVIDED);

  useEffect(() => {
    if (!show) {
      setTab('upload');
      setPasteText('');
      setMode(IMPORT_MODES.PROVIDED);
    }
  }, [show]);

  useEffect(() => {
    setMode(preview?.exactBackup ? IMPORT_MODES.EXACT : IMPORT_MODES.PROVIDED);
  }, [preview]);

  if (!show) return null;

  const diagnostics = preview?.diagnostics || {};
  const handleBack = () => {
    onReset?.();
    setMode(IMPORT_MODES.PROVIDED);
  };

  return (
    <Modal
      show={show}
      onClose={onClose}
      title="Import sitemap"
      subtitle={preview ? `Review ${preview.sourceName || 'imported URLs'} before adding them` : 'Upload a supported file or paste a list of URLs'}
      scrollable
      className="import-modal"
      footer={preview ? (
        <>
          <Button variant="secondary" onClick={handleBack} disabled={loading}>Back</Button>
          <Button
            variant="primary"
            onClick={() => onImport?.(mode)}
            loading={loading}
            disabled={!diagnostics.validCount}
          >
            {preview.exactBackup ? 'Restore exact map' : `Import ${diagnostics.validCount || 0} URLs`}
          </Button>
        </>
      ) : null}
    >
      {!preview ? (
        <>
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={IMPORT_TABS}
            variant="tabs"
            optionRole="tab"
            ariaLabel="Import source"
            fullWidth
            className="import-source-tabs"
          />

          {tab === 'upload' ? (
            <>
              <div className="import-info">
                <p>JSON, XML, RSS, Atom, HTML, CSV, Markdown, and TXT files are supported up to 10 MB.</p>
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
                  <div className="import-loading" role="status">
                    <Loader2 size={32} className="spin" />
                    <span>Reading file...</span>
                  </div>
                ) : (
                  <>
                    <FileUp size={48} />
                    <span>Click to select a file or drag and drop</span>
                    <span className="import-hint">.json, .xml, .rss, .atom, .html, .csv, .md, .txt</span>
                  </>
                )}
              </label>
            </>
          ) : (
            <div className="import-paste-panel" role="tabpanel">
              <label htmlFor="import-paste-urls">URLs</label>
              <TextareaInput
                id="import-paste-urls"
                rows={10}
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder={'https://example.com/page\nhttps://another-site.com/articles/post'}
                disabled={loading}
                autoFocus
              />
              <p>Paste one URL per line. Blank lines, headings, duplicates, and invalid entries are reported before import.</p>
              <Button
                variant="primary"
                startIcon={<FileText size={16} />}
                onClick={() => onPasteReview?.(pasteText)}
                loading={loading}
                disabled={!pasteText.trim()}
              >
                Review URLs
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="import-preview" aria-live="polite">
          <div className="import-preview-summary">
            <div><strong>{diagnostics.validCount || 0}</strong><span>Valid unique pages</span></div>
            <div><strong>{diagnostics.duplicateCount || 0}</strong><span>Duplicates ignored</span></div>
            <div><strong>{diagnostics.invalidCount || 0}</strong><span>Invalid entries</span></div>
            <div><strong>{diagnostics.ignoredCount || 0}</strong><span>Headers ignored</span></div>
          </div>

          <div className="import-preview-detection">
            <span>Format: <strong>{preview.parseType}</strong></span>
            <span>Structure: <strong>{preview.hasExplicitStructure ? 'Detected' : 'Not detected'}</strong></span>
          </div>

          {!diagnostics.validCount ? (
            <div className="import-preview-error" role="alert">No valid HTTP or HTTPS URLs were found.</div>
          ) : null}

          {preview.exactBackup ? (
            <div className="import-exact-note">
              This is an exact Vellic map backup. Its saved hierarchy, connections, and map settings will be restored.
            </div>
          ) : (
            <RadioCardGroup
              name="import-mode"
              value={mode}
              onChange={setMode}
              className="import-mode-options"
              options={[
                {
                  value: IMPORT_MODES.PROVIDED,
                  label: 'Import as provided',
                  description: preview.hasExplicitStructure
                    ? 'Preserve the relationships supplied by this file.'
                    : 'Keep every URL as an equal, unconnected page.',
                },
                {
                  value: IMPORT_MODES.URL_HIERARCHY,
                  label: 'Build hierarchy from URLs',
                  description: 'Infer missing hostname and path sections. Inferred sections are not pages.',
                },
              ]}
            />
          )}

          {!preview.exactBackup && diagnostics.validCount ? (
            <p className="import-screenshot-note">Screenshots will not start automatically. After import, use Images to capture pages manually.</p>
          ) : null}
        </div>
      )}
    </Modal>
  );
};

export default ImportModal;
