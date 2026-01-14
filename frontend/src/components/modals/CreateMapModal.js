import React from 'react';
import { FolderPlus, X } from 'lucide-react';

const CreateMapModal = ({
  show,
  onClose,
  onSubmit,
  data,
  setData,
  projects,
  onAddProject
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card create-map-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create New Map</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="map-name">Map Name *</label>
            <input
              id="map-name"
              type="text"
              placeholder="My Sitemap"
              value={data.name}
              onChange={(e) => setData(d => ({ ...d, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="map-project">Project</label>
            <div className="select-with-add">
              <select
                id="map-project"
                value={data.projectId}
                onChange={(e) => setData(d => ({ ...d, projectId: e.target.value }))}
              >
                <option value="">No Project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="add-project-btn"
                onClick={onAddProject}
                title="Create new project"
              >
                <FolderPlus size={18} />
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="map-url">Starting URL (optional)</label>
            <input
              id="map-url"
              type="url"
              placeholder="https://example.com"
              value={data.url}
              onChange={(e) => setData(d => ({ ...d, url: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label htmlFor="map-description">Description (optional)</label>
            <textarea
              id="map-description"
              placeholder="Brief description of this sitemap..."
              value={data.description}
              onChange={(e) => setData(d => ({ ...d, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="form-group disabled-feature">
            <label>Collaborators</label>
            <div className="coming-soon-field">
              <span>Coming soon — will be available in Share</span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn primary"
            onClick={() => onSubmit(data)}
            disabled={!data.name.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateMapModal;
