import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';

import Button from '../ui/Button';
import Field from '../ui/Field';
import Modal from '../ui/Modal';
import SelectInput from '../ui/SelectInput';
import TextInput from '../ui/TextInput';
import TextareaInput from '../ui/TextareaInput';
import { ANNOTATION_STATUS_OPTIONS } from '../../utils/constants';

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

const getDescendantIds = (node, ids = new Set()) => {
  if (!node) return ids;
  if (node.children) {
    node.children.forEach((child) => {
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
  specialParentOptions = [],
}) => {
  const [title, setTitle] = useState(node?.title || '');
  const [url, setUrl] = useState(node?.url || '');
  const [pageType, setPageType] = useState(node?.pageType || 'Page');
  const [newTypeName, setNewTypeName] = useState('');
  const [showNewTypeInput, setShowNewTypeInput] = useState(false);
  const allPageTypes = [...PAGE_TYPES, ...customPageTypes];
  const [parentId, setParentId] = useState(
    node?.parentId ?? specialParentOptions[0]?.value ?? ''
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(node?.thumbnailUrl || '');
  const [description, setDescription] = useState(node?.description || '');
  const [metaTags, setMetaTags] = useState(node?.metaTags || '');
  const [annotationStatus, setAnnotationStatus] = useState(node?.annotations?.status || 'none');
  const [annotationTags, setAnnotationTags] = useState((node?.annotations?.tags || []).join(', '));
  const [annotationNote, setAnnotationNote] = useState(node?.annotations?.note || '');
  const fileInputRef = useRef(null);
  const trimmedUrl = url.trim();

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedNote = annotationNote.trim();
    const tags = annotationTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    onSave({
      ...node,
      title,
      url,
      pageType,
      parentId,
      thumbnailUrl,
      description,
      metaTags,
      annotations: {
        status: annotationStatus || 'none',
        tags,
        note: trimmedNote,
      },
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

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setThumbnailUrl(loadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  const modalTitle = mode === 'edit' ? 'Edit Page' : mode === 'duplicate' ? 'Duplicate Page' : 'Add Page';
  const isFormValid = title.trim() !== '' && pageType !== '' && pageType !== '__addnew__';

  const getExcludeIds = () => {
    if (!node?.id || !rootTree) return new Set();

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
    descendants.add(node.id);
    return descendants;
  };

  const excludeIds = getExcludeIds();
  const parentOptions = allNodes.filter((candidate) => !excludeIds.has(candidate.id));
  const hasSubdomainOption = specialParentOptions.some((option) => option.type === 'subdomain');
  const disableSubdomainOption = hasSubdomainOption && trimmedUrl.length > 0;
  const getSpecialOptionLabel = (option) => {
    if (option.type === 'subdomain' && disableSubdomainOption) {
      return `${option.label} (requires blank URL)`;
    }
    return option.label;
  };

  return (
    <Modal
      show={!!node}
      onClose={onClose}
      title={modalTitle}
      size="lg"
      scrollable
      className="edit-node-modal"
      bodyClassName="edit-node-form-content"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-node-form"
            variant="primary"
            disabled={!isFormValid}
          >
            {mode === 'edit' ? 'Save Changes' : mode === 'duplicate' ? 'Create Copy' : 'Add Page'}
          </Button>
        </>
      )}
    >
      <form onSubmit={handleSubmit} className="edit-node-form" id="edit-node-form">
        <Field label="Page Title" required>
          <TextInput
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Enter page title"
            required
          />
        </Field>

        <Field label="URL">
          <TextInput
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/page"
          />
        </Field>

        <Field label="Page Type" required>
          <SelectInput
            value={pageType}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === '__addnew__') {
                setShowNewTypeInput(true);
              } else {
                setPageType(nextValue);
                setShowNewTypeInput(false);
              }
            }}
            required
          >
            {allPageTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
            <option value="__addnew__">Add New Type...</option>
          </SelectInput>
          {showNewTypeInput ? (
            <TextInput
              type="text"
              className="new-type-input"
              value={newTypeName}
              onChange={(event) => setNewTypeName(event.target.value)}
              onBlur={handleAddNewType}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAddNewType();
                }
              }}
              placeholder="Enter new type name"
              autoFocus
            />
          ) : null}
        </Field>

        <Field
          label="Parent Page"
          hint={disableSubdomainOption ? 'Subdomain parent requires the URL to be blank.' : ''}
        >
          <SelectInput
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            {specialParentOptions.map((option) => {
              const isSubdomain = option.type === 'subdomain';
              const isDisabled = option.disabled || (isSubdomain && disableSubdomainOption);
              return (
                <option key={option.value} value={option.value} disabled={isDisabled}>
                  {getSpecialOptionLabel(option)}
                </option>
              );
            })}
            {parentOptions.map((candidate) => {
              const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(candidate.depth);
              const displayTitle = candidate.title || candidate.url || 'Untitled';
              return (
                <option key={candidate.id} value={candidate.id}>
                  {indent}{candidate.pageNumber} - {displayTitle}
                </option>
              );
            })}
          </SelectInput>
        </Field>

        <Field label="Thumbnail / Image">
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
              onDragOver={(event) => {
                event.preventDefault();
                event.currentTarget.classList.add('drag-over');
              }}
              onDragLeave={(event) => {
                event.currentTarget.classList.remove('drag-over');
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.currentTarget.classList.remove('drag-over');
                const file = event.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) {
                  const reader = new FileReader();
                  reader.onload = (loadEvent) => setThumbnailUrl(loadEvent.target.result);
                  reader.readAsDataURL(file);
                }
              }}
            >
              <Upload size={24} className="upload-icon" />
              <span className="upload-text">Drag image here or</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="btn-browse"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse files
              </Button>
              <span className="upload-text-small">or enter URL</span>
              <TextInput
                type="text"
                className="url-input-small"
                placeholder="https://example.com/image.jpg"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const urlValue = event.target.value.trim();
                    if (urlValue) setThumbnailUrl(urlValue);
                  }
                }}
                onBlur={(event) => {
                  const urlValue = event.target.value.trim();
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
        </Field>

        <Field label="Description">
          <TextareaInput
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Page description (meta description)"
            rows={3}
          />
        </Field>

        <Field label="Meta Tags">
          <TextareaInput
            value={metaTags}
            onChange={(event) => setMetaTags(event.target.value)}
            placeholder="Comma-separated tags: seo, marketing, landing"
            rows={2}
          />
        </Field>

        <Field label="Marker">
          <SelectInput
            value={annotationStatus}
            onChange={(event) => setAnnotationStatus(event.target.value)}
          >
            <option value="none">None</option>
            {ANNOTATION_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectInput>
        </Field>

        <Field
          label="Tags"
          hint="Optional labels for filtering and collaboration."
        >
          <TextInput
            type="text"
            value={annotationTags}
            onChange={(event) => setAnnotationTags(event.target.value)}
            placeholder="Comma-separated tags"
          />
        </Field>

        <Field label="Note">
          <TextareaInput
            value={annotationNote}
            onChange={(event) => setAnnotationNote(event.target.value)}
            placeholder="Short note shown on the node"
            rows={2}
          />
        </Field>
      </form>
    </Modal>
  );
};

export default EditNodeModal;
