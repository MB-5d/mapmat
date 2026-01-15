import React, { useState } from 'react';
import { FolderPlus, X } from 'lucide-react';

const SaveMapForm = ({
  projects,
  currentMap,
  rootUrl,
  defaultProjectId,
  defaultName,
  onSave,
  onCreateProject,
  onCancel,
}) => {
  // Get default name from root domain (e.g., "example" from "https://www.example.com")
  const getDefaultName = () => {
    if (defaultName) return defaultName;
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

  const handleSave = () => {
    if (!mapName.trim()) return;
    onSave(selectedProject || null, mapName);
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
      <div className="modal-footer">
        <button className="modal-btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="modal-btn primary" onClick={handleSave} disabled={!mapName.trim()}>
          Save Map
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
  onSave,
  onCreateProject,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card save-map-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        <h3>Save Map</h3>
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
            onSave={onSave}
            onCreateProject={onCreateProject}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
};

export default SaveMapModal;
