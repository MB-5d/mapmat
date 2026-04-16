import React, { useState } from 'react';
import { FolderPlus } from 'lucide-react';

import Button from '../ui/Button';
import Field from '../ui/Field';
import Modal from '../ui/Modal';
import SelectInput from '../ui/SelectInput';
import TextInput from '../ui/TextInput';
import TextareaInput from '../ui/TextareaInput';

const isVirtualProject = (project) => (
  !!project?.isVirtual
  || project?.id === 'uncategorized'
  || project?.name === 'Uncategorized'
  || project?.id === 'shared-with-me'
  || project?.name === 'Shared With Me'
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
  const [selectedProject, setSelectedProject] = useState(isVirtualProject({ id: defaultProjectId }) ? '' : (defaultProjectId || ''));
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [notes, setNotes] = useState(defaultNotes || currentMap?.notes || '');
  const selectableProjects = (projects || []).filter((project) => !isVirtualProject(project));

  const handleSave = () => {
    if (!mapName.trim()) return;
    onSave(selectedProject || null, mapName, notes);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const project = await onCreateProject(newProjectName);
    if (project?.id) {
      setSelectedProject(project.id);
    }
    setShowNewProject(false);
    setNewProjectName('');
  };

  return (
    <div className="save-map-form">
      <Field label="Map Name" required>
        <TextInput
          type="text"
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
          placeholder="Enter map name..."
          autoFocus
        />
      </Field>
      <Field label="Save to Project (optional)">
        <SelectInput
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="">No project (Uncategorized)</option>
          {selectableProjects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </SelectInput>
      </Field>
      {!showNewProject ? (
        <Button type="button" variant="ghost" size="sm" className="new-project-link" onClick={() => setShowNewProject(true)}>
          <FolderPlus size={14} />
          Create new project
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
          <Button size="sm" onClick={handleCreateProject}>Create</Button>
          <Button size="sm" variant="secondary" className="cancel" onClick={() => setShowNewProject(false)}>Cancel</Button>
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
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!mapName.trim()}>
          {submitLabel}
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
  title = 'Save Map',
  submitLabel = 'Save Map',
}) => {
  if (!show) return null;

  return (
    <Modal show={show} onClose={onClose} title={title} className="save-map-modal">
      {!isLoggedIn ? (
        <div className="login-prompt">
          <p>Please sign in to save your maps</p>
          <Button variant="primary" onClick={onRequireLogin}>
                Sign In
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
          onCancel={onClose}
          submitLabel={submitLabel}
        />
      )}
    </Modal>
  );
};

export default SaveMapModal;
