import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  Folder,
  FolderInput,
  FolderPlus,
  Network,
  Trash2,
} from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';

const isVirtualProject = (project) => (
  !!project?.isVirtual
  || project?.id === 'uncategorized'
  || project?.name === 'Uncategorized'
  || project?.id === 'shared-with-me'
  || project?.name === 'Shared With Me'
);

const isReadOnlyMap = (map) => !!map?.membership_role && map.membership_role !== 'owner';

const ProjectsModal = ({
  show,
  onClose,
  isLoggedIn,
  projects,
  expandedProjects,
  editingProjectId,
  editingProjectName,
  editingMapId,
  editingMapName,
  onToggleProjectExpanded,
  onEditProjectNameChange,
  onEditProjectNameStart,
  onEditProjectNameCancel,
  onRenameProject,
  onEditMapNameChange,
  onEditMapNameStart,
  onEditMapNameCancel,
  onRenameMap,
  onDeleteProject,
  onLoadMap,
  onDeleteMap,
  onMoveMap,
  onAddMap,
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
                  projects.map((project) => {
                    const projectIsVirtual = isVirtualProject(project);
                    const isExpanded = !!expandedProjects[project.id];

                    return (
                      <div
                        key={project.id}
                        className={`project-folder ${isExpanded ? 'project-folder-expanded' : ''}`}
                      >
                        <div
                          className="project-folder-header"
                          onClick={() => onToggleProjectExpanded(project.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onToggleProjectExpanded(project.id);
                            }
                          }}
                        >
                          <div className="project-folder-main">
                            <div className="project-folder-icon">
                              <Folder size={18} />
                            </div>
                            {editingProjectId === project.id && !projectIsVirtual ? (
                              <input
                                className="project-name-input"
                                value={editingProjectName}
                                onChange={(event) => onEditProjectNameChange(event.target.value)}
                                onBlur={() => onRenameProject(project.id, editingProjectName)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') onRenameProject(project.id, editingProjectName);
                                  if (event.key === 'Escape') onEditProjectNameCancel();
                                }}
                                onClick={(event) => event.stopPropagation()}
                                autoFocus
                              />
                            ) : projectIsVirtual ? (
                              <span className="project-folder-name">{project.name}</span>
                            ) : (
                              <div className="inline-title-row">
                                <span className="project-folder-name">{project.name}</span>
                                <button
                                  type="button"
                                  className="inline-title-edit-button project-title-edit-button"
                                  aria-label={`Rename project ${project.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onEditProjectNameStart(project.id, project.name);
                                  }}
                                >
                                  <Edit2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="project-folder-meta">
                            <span className="project-map-count">{project.maps?.length || 0} maps</span>
                            {!projectIsVirtual && (
                              <button
                                type="button"
                                className="project-add-map-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onAddMap(project.id);
                                }}
                              >
                                <FolderPlus size={14} />
                                Add map
                              </button>
                            )}
                            <div className="project-chevron">
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="project-folder-body">
                            <div className="project-maps">
                              {project.maps?.length === 0 ? (
                                <div className="project-maps-empty">No maps in this project</div>
                              ) : (
                                project.maps?.map((map) => {
                                  const mapIsReadOnly = isReadOnlyMap(map);

                                  return (
                                    <div key={map.id}>
                                      <div
                                        className="map-item"
                                        onClick={() => onLoadMap(map)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            onLoadMap(map);
                                          }
                                        }}
                                      >
                                        <Network size={16} />
                                        <div className="map-main">
                                          {editingMapId === map.id && !mapIsReadOnly ? (
                                            <input
                                              className="project-map-name-input"
                                              value={editingMapName}
                                              onChange={(event) => onEditMapNameChange(event.target.value)}
                                              onBlur={() => onRenameMap(project.id, map.id, editingMapName)}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') onRenameMap(project.id, map.id, editingMapName);
                                                if (event.key === 'Escape') onEditMapNameCancel();
                                              }}
                                              onClick={(event) => event.stopPropagation()}
                                              autoFocus
                                            />
                                          ) : mapIsReadOnly ? (
                                            <span className="map-name">{map.name}</span>
                                          ) : (
                                            <div className="inline-title-row">
                                              <span className="map-name">{map.name}</span>
                                              <button
                                                type="button"
                                                className="inline-title-edit-button map-title-edit-button"
                                                aria-label={`Rename map ${map.name}`}
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  onEditMapNameStart(map.id, map.name);
                                                }}
                                              >
                                                <Edit2 size={14} />
                                              </button>
                                            </div>
                                          )}
                                        </div>

                                        {!mapIsReadOnly && (
                                          <div className="map-actions" onClick={(event) => event.stopPropagation()}>
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
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                onDeleteMap(project.id, map.id);
                                              }}
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        )}
                                      </div>

                                      {movingMapId === map.id && (
                                        <div className="map-move-row" onClick={(event) => event.stopPropagation()}>
                                          <select
                                            value={moveTarget}
                                            onChange={(event) => setMoveTarget(event.target.value)}
                                          >
                                            <option value="">No project (Uncategorized)</option>
                                            {projects
                                              .filter((candidate) => !isVirtualProject(candidate))
                                              .map((candidate) => (
                                                <option key={candidate.id} value={candidate.id}>
                                                  {candidate.name}
                                                </option>
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
                                  );
                                })
                              )}
                            </div>

                            {!projectIsVirtual && (
                              <div className="project-folder-footer">
                                <button
                                  type="button"
                                  className="project-delete-btn"
                                  onClick={() => onDeleteProject(project.id)}
                                >
                                  <Trash2 size={14} />
                                  Delete project
                                </button>
                              </div>
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
