import React, { useEffect, useState } from 'react';
import {
  Folder,
  FolderInput,
  FolderPlus,
  Network,
  PlusSquare,
  Trash2,
} from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';
import Accordion from '../ui/Accordion';
import Button from '../ui/Button';
import { EditIcon } from '../ui/icons';
import SelectInput from '../ui/SelectInput';
import TextInput from '../ui/TextInput';

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
      title="Maps & Projects"
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
                      <Accordion
                        key={project.id}
                        id={`project-folder-${project.id}`}
                        className="project-folder"
                        contentClassName="project-folder-body"
                        open={isExpanded}
                        onOpenChange={() => onToggleProjectExpanded(project.id)}
                        headerActionsPlacement="beforeMeta"
                        title={(
                          <span className="project-folder-main">
                            <span className="project-folder-icon" aria-hidden="true">
                              <Folder size={18} />
                            </span>
                            <span className="project-folder-name">{project.name}</span>
                          </span>
                        )}
                        meta={<span className="project-map-count">{project.maps?.length || 0} maps</span>}
                        headerActions={!projectIsVirtual ? (
                          <div className="project-folder-header-actions">
                            <button
                              type="button"
                              className="inline-title-edit-button project-title-edit-button"
                              aria-label={`Rename project ${project.name}`}
                              onClick={() => {
                                if (!isExpanded) onToggleProjectExpanded(project.id);
                                onEditProjectNameStart(project.id, project.name);
                              }}
                            >
                              <EditIcon size={14} />
                            </button>
                          </div>
                        ) : null}
                      >
                        {editingProjectId === project.id && !projectIsVirtual ? (
                          <div className="project-rename-row">
                            <TextInput
                              inputClassName="project-name-input"
                              value={editingProjectName}
                              onChange={(event) => onEditProjectNameChange(event.target.value)}
                              onBlur={() => onRenameProject(project.id, editingProjectName)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') onRenameProject(project.id, editingProjectName);
                                if (event.key === 'Escape') onEditProjectNameCancel();
                              }}
                              autoFocus
                            />
                          </div>
                        ) : null}
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
                                        <TextInput
                                          inputClassName="project-map-name-input"
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
                                            <EditIcon size={14} />
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {!mapIsReadOnly && (
                                      <div className="map-actions" onClick={(event) => event.stopPropagation()}>
                                        <button
                                          className="map-move"
                                          type="button"
                                          title="Move map"
                                          onClick={() => {
                                            setMovingMapId(map.id);
                                            setMoveTarget(map.project_id || '');
                                          }}
                                        >
                                          <FolderInput size={14} />
                                        </button>
                                        <button
                                          className="map-delete"
                                          type="button"
                                          title="Delete map"
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
                                      <SelectInput
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
                                      </SelectInput>
                                      <Button
                                        className="map-move-confirm"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                          onMoveMap(map.id, moveTarget || null);
                                          setMovingMapId(null);
                                        }}
                                      >
                                        Move
                                      </Button>
                                      <Button
                                        className="map-move-cancel"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => setMovingMapId(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>

                        {!projectIsVirtual && (
                          <div className="project-folder-footer">
                            <Button
                              type="button"
                              className="project-delete-btn"
                              size="sm"
                              variant="danger"
                              onClick={() => onDeleteProject(project.id)}
                            >
                              <Trash2 size={14} />
                              Delete project
                            </Button>
                          </div>
                        )}
                      </Accordion>
                    );
                  })
                )}
              </div>

              <div className="projects-modal-actions">
                <Button
                  className="add-map-btn"
                  type="button"
                  variant="primary"
                  startIcon={<PlusSquare />}
                  onClick={() => onAddMap()}
                >
                  New map
                </Button>
                <Button
                  className="add-project-btn"
                  type="button"
                  variant="secondary"
                  startIcon={<FolderPlus />}
                  onClick={onAddProject}
                >
                  New project
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </AccountDrawer>
  );
};

export default ProjectsModal;
