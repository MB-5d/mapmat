import React, { useState } from 'react';
import { FolderPlus } from 'lucide-react';

import Button from '../ui/Button';
import Field from '../ui/Field';
import Modal from '../ui/Modal';
import SelectInput from '../ui/SelectInput';
import TextInput from '../ui/TextInput';
import TextareaInput from '../ui/TextareaInput';
import { findMapNameConflict, getMapNameConflictMessage } from '../../utils/mapNameConflicts';

const waitForUiResponse = () => new Promise((resolve) => setTimeout(resolve, 0));

const isVirtualProject = (project) => (
  !!project?.isVirtual
  || project?.id === 'uncategorized'
  || project?.id === 'shared-with-me'
);

const SaveMapForm = ({
  projects,
  currentMap,
  rootUrl,
  defaultProjectId,
  defaultName,
  defaultNotes,
  onSave,
  onCreateProject,
  projectCreateDisabledReason = '',
  onCancel,
  cancelLabel = 'Cancel',
  submitLabel,
  submitLoadingLabel,
  saving = false,
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
  const [selectedProject, setSelectedProject] = useState(isVirtualProject({ id: defaultProjectId }) ? '' : (defaultProjectId || ''));
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [notes, setNotes] = useState(defaultNotes || currentMap?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');
  const selectableProjects = (projects || []).filter((project) => !isVirtualProject(project));

  const handleSave = async () => {
    if (!mapName.trim() || isSubmitting || saving) return;
    const conflict = findMapNameConflict(projects, {
      projectId: selectedProject || null,
      name: mapName,
      excludeMapId: currentMap?.id || null,
    });
    if (conflict) {
      setNameError(getMapNameConflictMessage(mapName));
      return;
    }
    setIsSubmitting(true);
    try {
      await waitForUiResponse();
      await Promise.resolve(onSave(selectedProject || null, mapName, notes));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || projectCreateDisabledReason) return;
    const project = await onCreateProject(newProjectName);
    if (project?.id) {
      setSelectedProject(project.id);
    }
    setShowNewProject(false);
    setNewProjectName('');
  };

  return (
    <div className="save-map-form">
      <Field label="Map name" required error={nameError}>
        <TextInput
          type="text"
          value={mapName}
          onChange={(e) => {
            setMapName(e.target.value);
            setNameError('');
          }}
          placeholder="Enter map name..."
          autoFocus
          invalid={Boolean(nameError)}
        />
      </Field>
      <Field label="Save in">
        <SelectInput
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="">One-offs</option>
          {selectableProjects.length > 0 ? (
            <optgroup label="Projects">
              {selectableProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          ) : null}
        </SelectInput>
      </Field>
      {!showNewProject ? (
        <Button
          type="link"
          buttonStyle="brand"
          size="sm"
          className="new-project-link"
          startIcon={<FolderPlus />}
          onClick={() => setShowNewProject(true)}
          disabled={Boolean(projectCreateDisabledReason)}
        >
          {projectCreateDisabledReason || 'Create new project'}
        </Button>
      ) : (
        <div className="new-project-inline">
          <TextInput
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project name..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateProject();
              if (e.key === 'Escape') setShowNewProject(false);
            }}
          />
          <Button size="sm" onClick={handleCreateProject} disabled={Boolean(projectCreateDisabledReason)}>Create</Button>
          <Button size="sm" variant="secondary" onClick={() => setShowNewProject(false)}>Cancel</Button>
        </div>
      )}
      <Field label="Notes (optional)">
        <TextareaInput
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this map..."
          rows={3}
        />
      </Field>
      <div className="modal-footer">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting || saving}>
          {cancelLabel}
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!mapName.trim() || isSubmitting || saving} loading={isSubmitting || saving}>
          {(isSubmitting || saving) ? (submitLoadingLabel || 'Saving') : submitLabel}
        </Button>
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
  onSave,
  onCreateProject,
  projectCreateDisabledReason = '',
  onCancel,
  cancelLabel = 'Cancel',
  title = 'Save map',
  submitLabel = 'Save map',
  submitLoadingLabel = 'Saving',
  saving = false,
}) => {
  if (!show) return null;

  return (
    <Modal show={show} onClose={onClose} title={title} className="save-map-modal">
      {!isLoggedIn ? (
        <div className="login-prompt">
          <p>Please sign in to save your maps</p>
          <Button variant="primary" onClick={onRequireLogin}>
                Sign in
          </Button>
        </div>
      ) : (
        <SaveMapForm
          projects={projects}
          currentMap={currentMap}
          rootUrl={rootUrl}
          defaultProjectId={defaultProjectId}
          defaultName={defaultName}
          defaultNotes={defaultNotes}
          onSave={onSave}
          onCreateProject={onCreateProject}
          projectCreateDisabledReason={projectCreateDisabledReason}
          onCancel={onCancel || onClose}
          cancelLabel={cancelLabel}
          submitLabel={submitLabel}
          submitLoadingLabel={submitLoadingLabel}
          saving={saving}
        />
      )}
    </Modal>
  );
};

export default SaveMapModal;
