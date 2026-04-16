import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ProjectsModal from './ProjectsModal';

describe('ProjectsModal', () => {
  let container;
  let root;
  let props;

  const ownedProject = {
    id: 'project-1',
    name: 'Alpha Project',
    maps: [
      {
        id: 'map-1',
        name: 'Alpha Map',
        project_id: 'project-1',
      },
    ],
  };

  const renderModal = (nextProps = {}) => {
    props = {
      show: true,
      onClose: jest.fn(),
      isLoggedIn: true,
      projects: [ownedProject],
      expandedProjects: {},
      editingProjectId: null,
      editingProjectName: '',
      editingMapId: null,
      editingMapName: '',
      onToggleProjectExpanded: jest.fn(),
      onEditProjectNameChange: jest.fn(),
      onEditProjectNameStart: jest.fn(),
      onEditProjectNameCancel: jest.fn(),
      onRenameProject: jest.fn(),
      onEditMapNameChange: jest.fn(),
      onEditMapNameStart: jest.fn(),
      onEditMapNameCancel: jest.fn(),
      onRenameMap: jest.fn(),
      onDeleteProject: jest.fn(),
      onLoadMap: jest.fn(),
      onDeleteMap: jest.fn(),
      onMoveMap: jest.fn(),
      onAddMap: jest.fn(),
      onAddProject: jest.fn(),
      ...nextProps,
    };

    act(() => {
      root.render(<ProjectsModal {...props} />);
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  test('shows add-map only for owned projects and keeps delete inside the expanded body', () => {
    renderModal();

    const addMapButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.replace(/\s+/g, ' ').trim() === 'Add map'
    );

    expect(addMapButton).not.toBeNull();
    expect(container.textContent).not.toContain('Delete project');

    act(() => {
      addMapButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onAddMap).toHaveBeenCalledWith('project-1');

    renderModal({ expandedProjects: { 'project-1': true } });
    expect(container.textContent).toContain('Delete project');
  });

  test('clicking project and map titles keeps expand and open behavior intact', () => {
    renderModal({ expandedProjects: { 'project-1': true } });

    const projectTitle = container.querySelector('.project-folder-name');
    const mapTitle = container.querySelector('.map-name');

    act(() => {
      projectTitle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      mapTitle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onToggleProjectExpanded).toHaveBeenCalledWith('project-1');
    expect(props.onLoadMap).toHaveBeenCalledWith(ownedProject.maps[0]);
    expect(props.onEditProjectNameStart).not.toHaveBeenCalled();
    expect(props.onEditMapNameStart).not.toHaveBeenCalled();
  });

  test('starts inline rename only from the edit buttons and commits rename inputs on blur', () => {
    renderModal({ expandedProjects: { 'project-1': true } });

    const projectEditButton = container.querySelector('.project-title-edit-button');
    const mapEditButton = container.querySelector('.map-title-edit-button');

    act(() => {
      projectEditButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      mapEditButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onEditProjectNameStart).toHaveBeenCalledWith('project-1', 'Alpha Project');
    expect(props.onEditMapNameStart).toHaveBeenCalledWith('map-1', 'Alpha Map');

    renderModal({
      expandedProjects: { 'project-1': true },
      editingProjectId: 'project-1',
      editingProjectName: 'Renamed Project',
      editingMapId: 'map-1',
      editingMapName: 'Renamed Map',
    });

    const projectInput = container.querySelector('.project-name-input');
    const mapInput = container.querySelector('.project-map-name-input');

    act(() => {
      projectInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      mapInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(props.onRenameProject).toHaveBeenCalledWith('project-1', 'Renamed Project');
    expect(props.onRenameMap).toHaveBeenCalledWith('project-1', 'map-1', 'Renamed Map');
  });

  test('uses shared button, input, and select primitives for standard project controls', () => {
    renderModal({
      expandedProjects: { 'project-1': true },
      editingProjectId: 'project-1',
      editingProjectName: 'Renamed Project',
      editingMapId: 'map-1',
      editingMapName: 'Renamed Map',
    });

    const addMapButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.replace(/\s+/g, ' ').trim() === 'Add map'
    );
    const addProjectButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.replace(/\s+/g, ' ').trim() === 'Add Project'
    );
    const projectInput = container.querySelector('.project-name-input');
    const mapInput = container.querySelector('.project-map-name-input');

    expect(addMapButton.className).toContain('ui-btn');
    expect(addProjectButton.className).toContain('ui-btn');
    expect(projectInput.className).toContain('ui-input');
    expect(mapInput.className).toContain('ui-input');

    const moveButton = container.querySelector('.map-move');
    act(() => {
      moveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const moveSelect = container.querySelector('.map-move-row select');
    const confirmMoveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Move')
    );

    expect(moveSelect.className).toContain('ui-select');
    expect(confirmMoveButton.className).toContain('ui-btn');
  });
});
