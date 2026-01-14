import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';

// Page types for dropdown
const PAGE_TYPES = [
  'Page',
  'Blog Post',
  'Product',
  'Category',
  'Landing Page',
  'Contact',
  'About',
  'FAQ',
  'Service',
  'Portfolio',
];

// Helper to get all descendant IDs of a node
const getDescendantIds = (node, ids = new Set()) => {
  if (!node) return ids;
  if (node.children) {
    node.children.forEach(child => {
      ids.add(child.id);
      getDescendantIds(child, ids);
    });
  }
  return ids;
};

const EditNodeModal = ({
  node,
  allNodes,
  rootTree,
  onClose,
  onSave,
  mode = 'edit',
  customPageTypes = [],
  onAddCustomType,
}) => {
  const [title, setTitle] = useState(node?.title || '');
  const [url, setUrl] = useState(node?.url || '');
  const [pageType, setPageType] = useState(node?.pageType || 'Page');
  const [newTypeName, setNewTypeName] = useState('');
  const [showNewTypeInput, setShowNewTypeInput] = useState(false);

  // Combined list of all page types
  const allPageTypes = [...PAGE_TYPES, ...customPageTypes];
  const [parentId, setParentId] = useState(node?.parentId || '');
  const [thumbnailUrl, setThumbnailUrl] = useState(node?.thumbnailUrl || '');
  const [description, setDescription] = useState(node?.description || '');
  const [metaTags, setMetaTags] = useState(node?.metaTags || '');
  const fileInputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...node,
      title,
      url,
      pageType,
      parentId: parentId || null,
      thumbnailUrl,
      description,
      metaTags,
    });
    onClose();
  };

  const handleAddNewType = () => {
    const trimmed = newTypeName.trim();
    if (trimmed && !allPageTypes.includes(trimmed)) {
      onAddCustomType(trimmed);
      setPageType(trimmed);
    }
    setNewTypeName('');
    setShowNewTypeInput(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setThumbnailUrl(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const modalTitle = mode === 'edit' ? 'Edit Page' : mode === 'duplicate' ? 'Duplicate Page' : 'Add Page';

  // Form validation - check if required fields are filled
  // For edit/duplicate: parentId can be empty (orphan pages are valid)
  // For add: parentId is optional (user can create orphans)
  const isFormValid = title.trim() !== '' && pageType !== '' && pageType !== '__addnew__';

  // Filter out current node and its descendants from parent options
  // (can't be parent of itself or create circular reference)
  const getExcludeIds = () => {
    if (!node?.id || !rootTree) return new Set();
    // Find the full node in tree to get its descendants
    const findNode = (tree, id) => {
      if (!tree) return null;
      if (tree.id === id) return tree;
      for (const child of tree.children || []) {
        const found = findNode(child, id);
        if (found) return found;
      }
      return null;
    };
    const fullNode = findNode(rootTree, node.id);
    const descendants = fullNode ? getDescendantIds(fullNode) : new Set();
    descendants.add(node.id); // Also exclude self
    return descendants;
  };

  const excludeIds = getExcludeIds();
  const parentOptions = allNodes.filter(n => !excludeIds.has(n.id));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card edit-node-modal" onClick={(e) => e.stopPropagation()}>
        <div className="edit-node-header">
          <h3>{modalTitle}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-node-form">
          <div className="edit-node-form-content">
            <div className="form-group">
              <label>Page Title<span className="required-asterisk">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter page title"
                required
              />
            </div>

            <div className="form-group">
              <label>URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/page"
              />
            </div>

            <div className="form-group">
              <label>Page Type<span className="required-asterisk">*</span></label>
              <select
                value={pageType}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__addnew__') {
                    setShowNewTypeInput(true);
                  } else {
                    setPageType(val);
                    setShowNewTypeInput(false);
                  }
                }}
                required
              >
                {allPageTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
                <option value="__addnew__">➕ Add New Type...</option>
              </select>
              {showNewTypeInput && (
                <input
                  type="text"
                  className="new-type-input"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onBlur={handleAddNewType}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewType();
                    }
                  }}
                  placeholder="Enter new type name"
                  autoFocus
                />
              )}
            </div>

            <div className="form-group">
              <label>Parent Page</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">No Parent (Orphan)</option>
                {parentOptions.map(n => {
                  const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(n.depth);
                  const displayTitle = n.title || n.url || 'Untitled';
                  return (
                    <option key={n.id} value={n.id}>
                      {indent}{n.pageNumber} - {displayTitle}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-group">
              <label>Thumbnail / Image</label>
              {thumbnailUrl ? (
                <div className="thumbnail-preview">
                  <img src={thumbnailUrl} alt="Thumbnail preview" />
                  <button
                    type="button"
                    className="btn-remove-thumb"
                    onClick={() => setThumbnailUrl('')}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  className="image-upload-zone"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('drag-over');
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('drag-over');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('drag-over');
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = (event) => setThumbnailUrl(event.target.result);
                      reader.readAsDataURL(file);
                    }
                  }}
                >
                  <Upload size={24} className="upload-icon" />
                  <span className="upload-text">Drag image here or</span>
                  <button
                    type="button"
                    className="btn-browse"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse files
                  </button>
                  <span className="upload-text-small">or enter URL</span>
                  <input
                    type="text"
                    className="url-input-small"
                    placeholder="https://example.com/image.jpg"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const urlValue = e.target.value.trim();
                        if (urlValue) setThumbnailUrl(urlValue);
                      }
                    }}
                    onBlur={(e) => {
                      const urlValue = e.target.value.trim();
                      if (urlValue) setThumbnailUrl(urlValue);
                    }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.gif,.webp"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Page description (meta description)"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Meta Tags</label>
              <textarea
                value={metaTags}
                onChange={(e) => setMetaTags(e.target.value)}
                placeholder="Comma-separated tags: seo, marketing, landing"
                rows={2}
              />
            </div>
          </div>

          <div className="edit-node-footer">
            <button type="button" className="modal-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={`modal-btn primary ${!isFormValid ? 'disabled' : ''}`}
              disabled={!isFormValid}
            >
              {mode === 'edit' ? 'Save Changes' : mode === 'duplicate' ? 'Create Copy' : 'Add Page'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditNodeModal;
