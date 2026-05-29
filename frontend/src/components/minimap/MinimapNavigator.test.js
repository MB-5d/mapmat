import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import MinimapNavigator, { normalizeWorldBounds } from './MinimapNavigator';

const dispatchPointer = (target, type, { clientX, clientY, pointerId = 1 }) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  target.dispatchEvent(event);
};

describe('MinimapNavigator', () => {
  let container;
  let root;
  let originalResizeObserver;
  let originalSetPointerCapture;
  let originalReleasePointerCapture;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    originalSetPointerCapture = Element.prototype.setPointerCapture;
    originalReleasePointerCapture = Element.prototype.releasePointerCapture;
    Element.prototype.setPointerCapture = jest.fn();
    Element.prototype.releasePointerCapture = jest.fn();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    window.ResizeObserver = originalResizeObserver;
    if (originalSetPointerCapture) {
      Element.prototype.setPointerCapture = originalSetPointerCapture;
    } else {
      delete Element.prototype.setPointerCapture;
    }
    if (originalReleasePointerCapture) {
      Element.prototype.releasePointerCapture = originalReleasePointerCapture;
    } else {
      delete Element.prototype.releasePointerCapture;
    }
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

  test('uses shared icon button states for minimap zoom controls', () => {
    const onZoomIn = jest.fn();
    const onZoomOut = jest.fn();

    act(() => {
      root.render(
        <MinimapNavigator
          layout={null}
          bounds={{ w: 4000, h: 2000 }}
          canvasSize={{ width: 1000, height: 500 }}
          pan={{ x: -500, y: -250 }}
          scale={0.5}
          minScale={0.1}
          maxScale={2}
          colors={{}}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
        />
      );
    });

    const zoomOutButton = container.querySelector('button[aria-label="Zoom out"]');
    const zoomInButton = container.querySelector('button[aria-label="Zoom in"]');
    expect(zoomOutButton.className).toContain('ui-icon-btn');
    expect(zoomOutButton.className).toContain('ui-icon-btn--style-mono');
    expect(zoomInButton.className).toContain('ui-icon-btn');
    expect(zoomInButton.className).toContain('ui-icon-btn--style-mono');

    act(() => {
      zoomOutButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      zoomInButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onZoomIn).toHaveBeenCalledTimes(1);
  });

  test('disables minimap zoom controls at zoom bounds', () => {
    act(() => {
      root.render(
        <MinimapNavigator
          layout={null}
          bounds={{ w: 4000, h: 2000 }}
          canvasSize={{ width: 1000, height: 500 }}
          pan={{ x: -500, y: -250 }}
          scale={0.1}
          minScale={0.1}
          maxScale={2}
          colors={{}}
        />
      );
    });

    expect(container.querySelector('button[aria-label="Zoom out"]').disabled).toBe(true);
    expect(container.querySelector('button[aria-label="Zoom in"]').disabled).toBe(false);
  });

  test('drags the red viewport box by the total pointer distance', () => {
    const onPanTo = jest.fn();
    act(() => {
      root.render(
        <MinimapNavigator
          layout={null}
          bounds={{ w: 4000, h: 2000 }}
          canvasSize={{ width: 1000, height: 500 }}
          pan={{ x: -500, y: -250 }}
          scale={0.5}
          colors={{}}
          onPanTo={onPanTo}
        />
      );
    });

    const preview = container.querySelector('.minimap-navigator-preview');
    expect(preview).not.toBeNull();
    preview.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 320,
      height: 110,
      right: 320,
      bottom: 110,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    act(() => {
      dispatchPointer(preview, 'pointerdown', { clientX: 160, clientY: 55 });
      dispatchPointer(preview, 'pointermove', { clientX: 180, clientY: 65 });
      dispatchPointer(preview, 'pointermove', { clientX: 200, clientY: 75 });
    });

    expect(onPanTo).toHaveBeenCalledTimes(2);
    const [worldLeft, worldTop] = onPanTo.mock.calls[1];
    expect(worldLeft).toBeCloseTo(1727.27);
    expect(worldTop).toBeCloseTo(863.64);
  });
});
