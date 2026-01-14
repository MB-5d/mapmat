import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  Folder,
  FolderPlus,
  Map as MapIcon,
  Trash2,
  X,
} from 'lucide-react';

const ProjectsModal = ({
  show,
  onClose,
  isLoggedIn,
  projects,
  expandedProjects,
  editingProjectId,
  editingProjectName,
  onToggleProjectExpanded,
  onEditProjectNameChange,
  onEditProjectNameStart,
  onEditProjectNameCancel,
  onRenameProject,
  onDeleteProject,
  onLoadMap,
  onDeleteMap,
  onAddProject,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card projects-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        <h3>Projects & Maps</h3>
        {!isLoggedIn ? (
          <div className="projects-empty">
            Please log in to save and manage projects
          </div>
        ) : (
          <>
            <div className="projects-list">
              {projects.length === 0 ? (
                <div className="projects-empty">
                  No projects yet. Create one to organize your maps.
                </div>
              ) : (
                projects.map(project => (
                  <div key={project.id} className="project-folder">
                    <div className="project-folder-header" onClick={() => onToggleProjectExpanded(project.id)}>
                      <div className="project-folder-icon">
                        <Folder size={18} />
                      </div>
                      {editingProjectId === project.id ? (
                        <input
                          className="project-name-input"
                          value={editingProjectName}
                          onChange={(e) => onEditProjectNameChange(e.target.value)}
                          onBlur={() => onRenameProject(project.id, editingProjectName)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onRenameProject(project.id, editingProjectName);
                            if (e.key === 'Escape') onEditProjectNameCancel();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <span className="project-folder-name">{project.name}</span>
                      )}
                      <span className="project-map-count">{project.maps?.length || 0} maps</span>
                      <div className="project-chevron">
                        {expandedProjects[project.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                      <div className="project-folder-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="project-action-btn"
                          title="Rename"
                          onClick={() => onEditProjectNameStart(project.id, project.name)}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="project-action-btn danger"
                          title="Delete Project"
                          onClick={() => onDeleteProject(project.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {expandedProjects[project.id] && (
                      <div className="project-maps">
                        {project.maps?.length === 0 ? (
                          <div className="project-maps-empty">No maps in this project</div>
                        ) : (
                          project.maps?.map(map => (
                            <div key={map.id} className="map-item" onClick={() => onLoadMap(map)}>
                              <MapIcon size={16} />
                              <span className="map-name">{map.name}</span>
                              <span className="map-date">{new Date(map.updatedAt).toLocaleDateString()}</span>
                              <button
                                className="map-delete"
                                title="Delete Map"
                                onClick={(e) => { e.stopPropagation(); onDeleteMap(project.id, map.id); }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <button
              className="add-project-btn"
              onClick={onAddProject}
            >
              <FolderPlus size={18} />
              Add Project
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ProjectsModal;
