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
  || project?.id === 'shared-with-me'
);

const isOneOffsGroup = (project) => project?.id === 'uncategorized';

const isSharedMapsGroup = (project) => project?.id === 'shared-with-me';

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
  projectCreateDisabledReason = '',
}) => {
  const [movingMapId, setMovingMapId] = useState(null);
  const [moveTarget, setMoveTarget] = useState('');

  useEffect(() => {
    if (!show) {
      setMovingMapId(null);
      setMoveTarget('');
    }
  }, [show]);

  const projectList = projects || [];
  const oneOffsGroup = projectList.find(isOneOffsGroup) || {
    id: 'uncategorized',
    name: 'One-offs',
    maps: [],
    isVirtual: true,
  };
  const sharedMapsGroup = projectList.find(isSharedMapsGroup);
  const mapGroups = [oneOffsGroup, sharedMapsGroup].filter(Boolean);
  const standardProjects = projectList.filter((project) => !isVirtualProject(project));

  const renderMapRows = (project, emptyMessage) => (
    <div className="project-maps">
      {project.maps?.length === 0 ? (
        <div className="project-maps-empty">{emptyMessage}</div>
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
                    aria-label={`Move ${map.name} to`}
                  >
                    <option value="">One-offs</option>
                    {standardProjects.length > 0 ? (
                      <optgroup label="Projects">
                        {standardProjects.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
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
  );

  const renderProjectAccordion = (project, { mapGroup = false } = {}) => {
    const isExpanded = !!expandedProjects[project.id];
    const displayName = isOneOffsGroup(project)
      ? 'One-offs'
      : (isSharedMapsGroup(project) ? 'Shared with me' : project.name);
    const emptyMessage = isOneOffsGroup(project)
      ? 'No one-off maps yet'
      : (isSharedMapsGroup(project) ? 'No shared maps' : 'No maps in this project');

    return (
      <Accordion
        key={project.id}
        id={`${mapGroup ? 'map-group' : 'project-folder'}-${project.id}`}
        className={mapGroup ? 'map-group' : 'project-folder'}
        contentClassName="project-folder-body"
        open={isExpanded}
        onOpenChange={() => onToggleProjectExpanded(project.id)}
        headerActionsPlacement="beforeMeta"
        title={mapGroup ? (
          <span className="map-group-main">
            <span className="map-group-name">{displayName}</span>
          </span>
        ) : (
          <span className="project-folder-main">
            <span className="project-folder-icon" aria-hidden="true">
              <Folder size={18} />
            </span>
            <span className="project-folder-name">{displayName}</span>
          </span>
        )}
        meta={<span className="project-map-count">{project.maps?.length || 0} maps</span>}
        headerActions={!mapGroup ? (
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
        {editingProjectId === project.id && !mapGroup ? (
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

        {renderMapRows(project, emptyMessage)}

        {!mapGroup ? (
          <div className="project-folder-footer">
            <Button
              type="button"
              className="project-delete-btn"
              size="sm"
              variant="ghost"
              buttonStyle="danger"
              startIcon={<Trash2 size={14} />}
              onClick={() => onDeleteProject(project.id)}
            >
              Delete project
            </Button>
          </div>
        ) : null}
      </Accordion>
    );
  };

  return (
    <AccountDrawer
      isOpen={show}
      onClose={onClose}
      title="Maps & projects"
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
                <section className="projects-section" aria-labelledby="maps-section-title">
                  <h3 id="maps-section-title" className="projects-section-title">Maps</h3>
                  <div className="projects-section-list">
                    {mapGroups.map((project) => renderProjectAccordion(project, { mapGroup: true }))}
                  </div>
                </section>

                <section className="projects-section" aria-labelledby="projects-section-title">
                  <h3 id="projects-section-title" className="projects-section-title">Projects</h3>
                  <div className="projects-section-list">
                    {standardProjects.length > 0 ? (
                      standardProjects.map((project) => renderProjectAccordion(project))
                    ) : (
                      <div className="projects-section-empty">
                        No projects yet. Create one to organize related maps.
                      </div>
                    )}
                  </div>
                </section>
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
                  disabled={Boolean(projectCreateDisabledReason)}
                >
                  {projectCreateDisabledReason || 'New project'}
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
