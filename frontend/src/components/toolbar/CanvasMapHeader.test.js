import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import CanvasMapHeader from './CanvasMapHeader';

describe('CanvasMapHeader', () => {
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

  test('uses the shared input primitive when editing the map name', () => {
    act(() => {
      root.render(
        <CanvasMapHeader
          canEdit
          mapName="Alpha Map"
          isEditingMapName
          onMapNameChange={jest.fn()}
          onMapNameBlur={jest.fn()}
          onMapNameKeyDown={jest.fn()}
          onMapNameClick={jest.fn()}
          collaborators={[]}
        />
      );
    });

    const input = container.querySelector('.canvas-map-name-input');

    expect(input).not.toBeNull();
    expect(input.className).toContain('ui-input');
  });
});
