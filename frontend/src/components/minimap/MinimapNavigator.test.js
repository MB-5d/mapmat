import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import MinimapNavigator, { normalizeWorldBounds } from './MinimapNavigator';

describe('MinimapNavigator', () => {
  let container;
  let root;
  let originalResizeObserver;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    window.ResizeObserver = originalResizeObserver;
    container.remove();
    container = null;
    root = null;
  });

  test('normalizes large-map scene bounds', () => {
    expect(normalizeWorldBounds({ w: 4000, h: 2000 })).toEqual({
      minX: 0,
      minY: 0,
      maxX: 4000,
      maxY: 2000,
    });
  });

  test('renders a finite viewfinder viewport from large-map bounds while zoomed', () => {
    act(() => {
      root.render(
        <MinimapNavigator
          layout={null}
          bounds={{ w: 4000, h: 2000 }}
          canvasSize={{ width: 1000, height: 500 }}
          pan={{ x: -500, y: -250 }}
          scale={0.5}
          colors={{}}
        />
      );
    });

    const viewport = container.querySelector('.minimap-navigator-viewport');
    expect(viewport).not.toBeNull();
    expect(Number(viewport.getAttribute('x'))).toBeCloseTo(105);
    expect(Number(viewport.getAttribute('y'))).toBeCloseTo(27.5);
    expect(Number(viewport.getAttribute('width'))).toBeCloseTo(110);
    expect(Number(viewport.getAttribute('height'))).toBeCloseTo(55);
  });
});
