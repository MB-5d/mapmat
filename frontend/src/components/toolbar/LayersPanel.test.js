import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import LayersPanel from './LayersPanel';

const getButton = (container, label) => (
  Array.from(container.querySelectorAll('button'))
    .find((button) => button.textContent.includes(label))
);

const renderPanel = (root, props = {}) => {
  const defaultProps = {
    embedded: true,
    layers: { userFlows: true, crossLinks: true, brokenLinks: true },
    connectionTool: null,
    onToggleUserFlows: jest.fn(),
    onToggleCrossLinks: jest.fn(),
    onToggleBrokenLinks: jest.fn(),
    connectionAvailability: {},
    scanLayerAvailability: {},
    scanLayerVisibility: {},
    onToggleScanLayer: jest.fn(),
    changeFilters: { statuses: {} },
    onToggleChangeStatus: jest.fn(),
    changeStatusOptions: [],
    showChangeSection: false,
  };

  act(() => {
    root.render(<LayersPanel {...defaultProps} {...props} />);
  });

  return { ...defaultProps, ...props };
};

describe('LayersPanel', () => {
  let container;
  let root;

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
    jest.clearAllMocks();
  });

  test('hides unavailable placement options and shows available status options', () => {
    renderPanel(root, {
      scanLayerAvailability: {
        placementPrimary: true,
        placementSubdomain: false,
        placementOrphan: false,
        statusBroken: true,
      },
      scanLayerVisibility: {
        placementPrimary: true,
        statusBroken: true,
      },
    });

    expect(container.textContent).toContain('Placement');
    expect(container.textContent).toContain('Primary');
    expect(container.textContent).not.toContain('Subdomain');
    expect(container.textContent).not.toContain('Orphan');
    expect(container.textContent).toContain('Status');
    expect(container.textContent).toContain('Broken Link');
  });

  test('keeps available subdomain and orphan options functional', () => {
    const onToggleScanLayer = jest.fn();
    renderPanel(root, {
      scanLayerAvailability: {
        placementPrimary: true,
        placementSubdomain: true,
        placementOrphan: true,
      },
      scanLayerVisibility: {
        placementPrimary: true,
        placementSubdomain: true,
        placementOrphan: true,
      },
      onToggleScanLayer,
    });

    act(() => {
      getButton(container, 'Subdomain').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      getButton(container, 'Orphan').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleScanLayer).toHaveBeenCalledWith('placementSubdomain');
    expect(onToggleScanLayer).toHaveBeenCalledWith('placementOrphan');
  });

  test('shows marker label filters only when marker labels are available', () => {
    const onToggleChangeStatus = jest.fn();
    renderPanel(root, {
      showChangeSection: true,
      changeStatusOptions: [{ value: 'moved', label: 'Moved' }],
      changeFilters: { statuses: { moved: true } },
      onToggleChangeStatus,
    });

    expect(container.textContent).toContain('Markers');
    expect(container.textContent).toContain('Moved');

    act(() => {
      getButton(container, 'Moved').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleChangeStatus).toHaveBeenCalledWith('moved');
  });
});
