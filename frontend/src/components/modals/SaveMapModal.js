import React, { useState } from 'react';
import { Edit2, Eye, FolderPlus, MessageSquare, X } from 'lucide-react';

const SaveMapForm = ({
  projects,
  currentMap,
  rootUrl,
  defaultProjectId,
  defaultName,
  defaultNotes,
  accessLevels,
  sharePermission,
  onChangePermission,
  onSave,
  onCreateProject,
  onCancel,
  submitLabel,
}) => {
  // Get default name from root domain (e.g., "example" from "https://www.example.com")
  const getDefaultName = () => {
    if (defaultName !== undefined && defaultName !== null) return defaultName;
    if (currentMap?.name) return currentMap.name;
    if (!rootUrl) return '';
    try {
      const hostname = new URL(rootUrl).hostname;
      // Remove www. prefix and get domain without TLD
      const parts = hostname.replace(/^www\./, '').split('.');
      // Return the main domain part (before TLD)
      return parts.length > 1 ? parts[parts.length - 2] : parts[0];
    } catch {
      return '';
    }
  };

  const [mapName, setMapName] = useState(getDefaultName());
  const [selectedProject, setSelectedProject] = useState(defaultProjectId || '');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [notes, setNotes] = useState(defaultNotes || currentMap?.notes || '');

  const handleSave = () => {
    if (!mapName.trim()) return;
    onSave(selectedProject || null, mapName, notes);
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName);
    setShowNewProject(false);
    setNewProjectName('');
  };

  return (
    <div className="save-map-form">
      <div className="form-group">
        <label>Map Name</label>
        <input
          type="text"
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
          placeholder="Enter map name..."
          autoFocus
        />
      </div>
      <div className="form-group">
        <label>Save to Project (optional)</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="">No project (Uncategorized)</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      {!showNewProject ? (
        <button className="new-project-link" onClick={() => setShowNewProject(true)}>
          <FolderPlus size={14} />
          Create new project
        </button>
      ) : (
        <div className="new-project-inline">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project name..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateProject();
              if (e.key === 'Escape') setShowNewProject(false);
            }}
          />
          <button onClick={handleCreateProject}>Create</button>
          <button className="cancel" onClick={() => setShowNewProject(false)}>Cancel</button>
        </div>
      )}
      <div className="form-group">
        <label>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this map..."
          rows={3}
        />
      </div>
      {accessLevels && (
        <div className="share-section save-map-share">
          <div className="share-section-title">Sharing permissions</div>
          <div className="share-permission-options">
            <label className={`share-permission-option ${sharePermission === accessLevels.VIEW ? 'selected' : ''}`}>
              <input
                type="radio"
                name="sharePermission"
                checked={sharePermission === accessLevels.VIEW}
                onChange={() => onChangePermission(accessLevels.VIEW)}
              />
              <Eye size={16} />
              <div className="share-permission-text">
                <span className="share-permission-label">View only</span>
                <span className="share-permission-desc">Can view the sitemap</span>
              </div>
            </label>
            <label className={`share-permission-option ${sharePermission === accessLevels.COMMENT ? 'selected' : ''}`}>
              <input
                type="radio"
                name="sharePermission"
                checked={sharePermission === accessLevels.COMMENT}
                onChange={() => onChangePermission(accessLevels.COMMENT)}
              />
              <MessageSquare size={16} />
              <div className="share-permission-text">
                <span className="share-permission-label">Can comment</span>
                <span className="share-permission-desc">View and add comments</span>
              </div>
            </label>
            <label className={`share-permission-option ${sharePermission === accessLevels.EDIT ? 'selected' : ''}`}>
              <input
                type="radio"
                name="sharePermission"
                checked={sharePermission === accessLevels.EDIT}
                onChange={() => onChangePermission(accessLevels.EDIT)}
              />
              <Edit2 size={16} />
              <div className="share-permission-text">
                <span className="share-permission-label">Can edit</span>
                <span className="share-permission-desc">Full editing access</span>
              </div>
            </label>
          </div>
        </div>
      )}
      <div className="modal-footer">
        <button className="modal-btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="modal-btn primary" onClick={handleSave} disabled={!mapName.trim()}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
};

const SaveMapModal = ({
  show,
  onClose,
  isLoggedIn,
  onRequireLogin,
  projects,
  currentMap,
  rootUrl,
  defaultProjectId,
  defaultName,
  defaultNotes,
  accessLevels,
  sharePermission,
  onChangePermission,
  onSave,
  onCreateProject,
  title = 'Save Map',
  submitLabel = 'Save Map',
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-md save-map-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          {!isLoggedIn ? (
            <div className="login-prompt">
              <p>Please sign in to save your maps</p>
              <button
                className="modal-btn primary"
                onClick={onRequireLogin}
              >
                Sign In
              </button>
            </div>
          ) : (
            <SaveMapForm
              projects={projects}
              currentMap={currentMap}
              rootUrl={rootUrl}
              defaultProjectId={defaultProjectId}
              defaultName={defaultName}
              defaultNotes={defaultNotes}
              accessLevels={accessLevels}
              sharePermission={sharePermission}
              onChangePermission={onChangePermission}
              onSave={onSave}
              onCreateProject={onCreateProject}
              onCancel={onClose}
              submitLabel={submitLabel}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default SaveMapModal;
