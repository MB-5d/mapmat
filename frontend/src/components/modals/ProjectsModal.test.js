import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import ProjectsModal from './ProjectsModal';

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');
const getCssRule = (selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return appCss.match(new RegExp(`${escapedSelector} \\{[^}]+\\}`))?.[0] || '';
};

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

  test('uses global new-map action and keeps delete inside the expanded body', () => {
    renderModal();

    expect(container.querySelector('.project-folder.ui-accordion')).not.toBeNull();
    expect(container.textContent).toContain('Maps & projects');
    expect(container.textContent).not.toContain('Projects & maps');

    const newMapButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.replace(/\s+/g, ' ').trim() === 'New map'
    );

    expect(newMapButton).not.toBeNull();
    expect(container.textContent).not.toContain('Add map');
    expect(container.textContent).not.toContain('Delete project');

    act(() => {
      newMapButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onAddMap).toHaveBeenCalledWith();

    renderModal({ expandedProjects: { 'project-1': true } });
    expect(container.textContent).toContain('Delete project');
  });

  test('separates map groups from project folders', () => {
    const oneOffs = {
      id: 'uncategorized',
      name: 'One-offs',
      maps: [{ id: 'map-one-off', name: 'Quick audit', project_id: null }],
      isVirtual: true,
    };
    const shared = {
      id: 'shared-with-me',
      name: 'Shared with me',
      maps: [{ id: 'map-shared', name: 'Shared audit', membership_role: 'viewer' }],
      isVirtual: true,
    };

    renderModal({
      projects: [ownedProject, shared, oneOffs],
      expandedProjects: {
        uncategorized: true,
        'shared-with-me': true,
        'project-1': true,
      },
    });

    expect(Array.from(container.querySelectorAll('.projects-section-title')).map((title) => title.textContent))
      .toEqual(['Maps', 'Projects']);
    expect(Array.from(container.querySelectorAll('.map-group-name')).map((title) => title.textContent))
      .toEqual(['One-offs', 'Shared with me']);
    expect(container.querySelectorAll('.map-group .project-folder-icon')).toHaveLength(0);
    expect(container.querySelectorAll('.map-group .project-title-edit-button')).toHaveLength(0);
    expect(container.querySelector('.project-folder .project-folder-icon')).not.toBeNull();
    expect(container.textContent).not.toContain('Uncategorized');
    expect(container.textContent).not.toContain('No project');
  });

  test('uses plain project icons with tighter title spacing', () => {
    const mainRule = getCssRule('.project-folder-main');
    const iconRule = getCssRule('.project-folder-icon');

    expect(mainRule).toContain('gap: 4px;');
    expect(iconRule).toContain('width: 20px;');
    expect(iconRule).toContain('height: 20px;');
    expect(iconRule).toContain('background: transparent;');
    expect(iconRule).not.toContain('border-radius:');
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

    const projectInput = container.querySelector('input.project-name-input');
    const mapInput = container.querySelector('input.project-map-name-input');

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

    const newMapButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.replace(/\s+/g, ' ').trim() === 'New map'
    );
    const newProjectButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.replace(/\s+/g, ' ').trim() === 'New project'
    );
    const projectInput = container.querySelector('input.project-name-input');
    const mapInput = container.querySelector('input.project-map-name-input');

    expect(newMapButton.className).toContain('ui-btn');
    expect(newMapButton.className).toContain('ui-btn--type-primary');
    expect(newMapButton.className).toContain('ui-btn--style-brand');
    expect(newProjectButton.className).toContain('ui-btn');
    expect(newProjectButton.className).toContain('ui-btn--type-secondary');
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
    expect(moveSelect.value).toBe('project-1');
    expect(moveSelect.options[0].textContent).toBe('One-offs');
    expect(moveSelect.querySelector('optgroup')?.label).toBe('Projects');
    expect(moveSelect.textContent).not.toContain('Uncategorized');
    expect(moveSelect.textContent).not.toContain('No project');
    expect(confirmMoveButton.className).toContain('ui-btn');
  });

  test('disables project creation when the project limit is reached', () => {
    renderModal({
      projectCreateDisabledReason: 'project limit reached',
    });

    const newProjectButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.replace(/\s+/g, ' ').trim() === 'project limit reached'
    );

    expect(newProjectButton).toBeTruthy();
    expect(newProjectButton.disabled).toBe(true);
  });

  test('keeps drawer header strokes on shared drawer families', () => {
    expect(getCssRule('.account-drawer-header')).toContain('border-bottom: var(--border-width-subtle) solid var(--ui-color-border);');
    expect(getCssRule('.report-drawer-header')).toContain('border-bottom: var(--border-width-subtle) solid var(--ui-color-border);');
  });

  test('keeps project accordion fills tied to the shared accordion surface', () => {
    expect(getCssRule('.project-maps')).toContain('background: transparent;');
    expect(getCssRule('.project-folder-footer')).toContain('background: transparent;');
    expect(appCss).not.toContain('[data-theme="dark"] .project-maps {\n  background:');
    expect(appCss).not.toContain('[data-theme="dark"] .project-folder-footer {\n  background:');
  });
});
