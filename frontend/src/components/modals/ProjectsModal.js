import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  Folder,
  FolderPlus,
  FolderInput,
  Network,
  Trash2,
} from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';

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
  onMoveMap,
  onAddProject,
}) => {
  const [movingMapId, setMovingMapId] = useState(null);
  const [moveTarget, setMoveTarget] = useState('');

  useEffect(() => {
    if (!show) {
      setMovingMapId(null);
      setMoveTarget('');
    }
  }, [show]);

  return (
    <AccountDrawer
      isOpen={show}
      onClose={onClose}
      title="Projects"
      subtitle="Projects & Maps"
      className="projects-drawer"
    >
      <div className="projects-modal">
        <div className="modal-body">
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
                  projects.map(project => {
                    const isUncategorized = project.id === 'uncategorized' || project.name === 'Uncategorized';
                    return (
                    <div key={project.id} className="project-folder">
                      <div className="project-folder-header" onClick={() => onToggleProjectExpanded(project.id)}>
                        <div className="project-folder-icon">
                          <Folder size={18} />
                        </div>
                        {editingProjectId === project.id && !isUncategorized ? (
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
                        {!isUncategorized && (
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
                        )}
                      </div>
                      {expandedProjects[project.id] && (
                        <div className="project-maps">
                          {project.maps?.length === 0 ? (
                            <div className="project-maps-empty">No maps in this project</div>
                          ) : (
                            project.maps?.map(map => (
                              <div key={map.id}>
                                <div className="map-item" onClick={() => onLoadMap(map)}>
                                  <Network size={16} />
                                  <span className="map-name">{map.name}</span>
                                  <div className="map-actions" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      className="map-move"
                                      title="Move Map"
                                      onClick={() => {
                                        setMovingMapId(map.id);
                                        setMoveTarget(map.project_id || '');
                                      }}
                                    >
                                      <FolderInput size={14} />
                                    </button>
                                    <button
                                      className="map-delete"
                                      title="Delete Map"
                                      onClick={(e) => { e.stopPropagation(); onDeleteMap(project.id, map.id); }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                                {movingMapId === map.id && (
                                  <div className="map-move-row" onClick={(e) => e.stopPropagation()}>
                                    <select
                                      value={moveTarget}
                                      onChange={(e) => setMoveTarget(e.target.value)}
                                    >
                                      <option value="">No project (Uncategorized)</option>
                                      {projects
                                        .filter(p => p.id !== 'uncategorized' && p.name !== 'Uncategorized')
                                        .map(p => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <button
                                      className="map-move-confirm"
                                      onClick={() => {
                                        onMoveMap(map.id, moveTarget || null);
                                        setMovingMapId(null);
                                      }}
                                    >
                                      Move
                                    </button>
                                    <button
                                      className="map-move-cancel"
                                      onClick={() => setMovingMapId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                  })
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
    </AccountDrawer>
  );
};

export default ProjectsModal;
