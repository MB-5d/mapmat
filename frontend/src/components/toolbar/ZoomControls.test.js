import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import ZoomControls from './ZoomControls';

describe('ZoomControls', () => {
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
  });

  test('labels the viewfinder toggle plainly', () => {
    act(() => {
      root.render(
        <ZoomControls
          scale={1}
          onZoomOut={jest.fn()}
          onZoomIn={jest.fn()}
          onResetView={jest.fn()}
          onToggleMinimap={jest.fn()}
          showMinimap={false}
        />
      );
    });

    expect(container.querySelector('button[aria-label="Viewfinder"]')).not.toBeNull();
    expect(container.querySelector('button[title="Viewfinder"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Toggle Viewfinder');
  });
});
