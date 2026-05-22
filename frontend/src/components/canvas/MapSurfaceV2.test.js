import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import MapSurfaceV2 from './MapSurfaceV2';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('MapSurfaceV2', () => {
  let container;
  let root;
  let originalRequestAnimationFrame;
  let originalCancelAnimationFrame;
  let originalGetContext;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalGetContext = window.HTMLCanvasElement.prototype.getContext;
    window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    window.HTMLCanvasElement.prototype.getContext = jest.fn(() => null);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    window.HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  test('reports scene home node for large-map centering', async () => {
    const scene = {
      mapId: 'map-1',
      homeNode: { id: 'home', x: 5000, y: 0, w: 288, h: 200 },
      visibleNodeCount: 0,
      nodes: [],
      connectors: [],
    };
    const getScene = jest.fn().mockResolvedValue({ scene });
    const onSceneLoaded = jest.fn();

    await act(async () => {
      root.render(
        <MapSurfaceV2
          mapId="map-1"
          getScene={getScene}
          getViewState={() => ({ pan: { x: 0, y: 0 }, scale: 1 })}
          canvasSize={{ width: 1000, height: 700 }}
          orientation="vertical"
          showThumbnails={false}
          colors={{}}
          selectedNodeIds={new Set()}
          onSceneLoaded={onSceneLoaded}
        />
      );
    });
    await act(async () => {
      await wait(350);
    });

    expect(getScene).toHaveBeenCalled();
    expect(onSceneLoaded).toHaveBeenCalledWith(scene);
  });

  test('fetches a fresh scene when the map id changes', async () => {
    const getScene = jest.fn().mockResolvedValue({
      scene: {
        mapId: 'map',
        homeNode: { id: 'home', x: 0, y: 0, w: 288, h: 200 },
        nodes: [],
        connectors: [],
      },
    });

    await act(async () => {
      root.render(
        <MapSurfaceV2
          mapId="map-1"
          getScene={getScene}
          getViewState={() => ({ pan: { x: 0, y: 0 }, scale: 1 })}
          canvasSize={{ width: 1000, height: 700 }}
          orientation="vertical"
          showThumbnails={false}
          colors={{}}
          selectedNodeIds={new Set()}
        />
      );
    });
    await act(async () => {
      await wait(350);
    });

    await act(async () => {
      root.render(
        <MapSurfaceV2
          mapId="map-2"
          getScene={getScene}
          getViewState={() => ({ pan: { x: 0, y: 0 }, scale: 1 })}
          canvasSize={{ width: 1000, height: 700 }}
          orientation="vertical"
          showThumbnails={false}
          colors={{}}
          selectedNodeIds={new Set()}
        />
      );
    });
    await act(async () => {
      await wait(350);
    });

    expect(getScene).toHaveBeenCalledTimes(2);
  });

  test('passes expanded stack ids to large-map scene requests', async () => {
    const getScene = jest.fn().mockResolvedValue({
      scene: {
        mapId: 'map-1',
        homeNode: { id: 'home', x: 0, y: 0, w: 288, h: 200 },
        nodes: [],
        connectors: [],
      },
    });

    await act(async () => {
      root.render(
        <MapSurfaceV2
          mapId="map-1"
          getScene={getScene}
          getViewState={() => ({ pan: { x: 0, y: 0 }, scale: 1 })}
          canvasSize={{ width: 1000, height: 700 }}
          orientation="vertical"
          showThumbnails={false}
          colors={{}}
          selectedNodeIds={new Set()}
          expandedStacks={{ stackB: true, stackA: true, stackC: false }}
        />
      );
    });
    await act(async () => {
      await wait(350);
    });

    expect(getScene).toHaveBeenCalled();
    expect(getScene.mock.calls[0][1].expandedStacks).toBe('stackA,stackB');
  });

  test('renders existing node card UI for visible scene nodes', async () => {
    const getScene = jest.fn().mockResolvedValue({
      scene: {
        mapId: 'map-1',
        bounds: { w: 900, h: 600 },
        homeNode: { id: 'home', x: 0, y: 0, w: 288, h: 200 },
        visibleNodeCount: 1,
        nodes: [{
          id: 'home',
          title: 'Home Page',
          url: 'https://example.com',
          number: '0',
          depth: 0,
          x: 0,
          y: 0,
          w: 288,
          h: 200,
        }],
        connectors: [],
      },
    });

    await act(async () => {
      root.render(
        <MapSurfaceV2
          mapId="map-1"
          getScene={getScene}
          getViewState={() => ({ pan: { x: 0, y: 0 }, scale: 1 })}
          canvasSize={{ width: 1000, height: 700 }}
          orientation="vertical"
          showThumbnails={false}
          colors={{}}
          selectedNodeIds={new Set()}
          showPageNumbers
        />
      );
    });
    await act(async () => {
      await wait(350);
    });

    expect(container.querySelector('.node-card')).not.toBeNull();
    expect(container.querySelector('.large-map-canvas')).toBeNull();
    expect(container.textContent).toContain('Home Page');
  });

  test('renders and toggles collapsed stack controls for large maps', async () => {
    const getScene = jest.fn().mockResolvedValue({
      scene: {
        mapId: 'map-1',
        bounds: { w: 900, h: 900 },
        homeNode: { id: 'home', x: 0, y: 0, w: 288, h: 200 },
        visibleNodeCount: 1,
        nodes: [{
          id: 'child-1',
          title: 'Child Page',
          url: 'https://example.com/child',
          number: '1.1',
          depth: 2,
          x: 40,
          y: 336,
          w: 288,
          h: 200,
          stackInfo: {
            parentId: 'parent-1',
            totalCount: 12,
            collapsed: true,
          },
        }],
        connectors: [],
      },
    });
    const onToggleStack = jest.fn();

    await act(async () => {
      root.render(
        <MapSurfaceV2
          mapId="map-1"
          getScene={getScene}
          getViewState={() => ({ pan: { x: 0, y: 0 }, scale: 1 })}
          canvasSize={{ width: 1000, height: 700 }}
          orientation="vertical"
          showThumbnails={false}
          colors={{}}
          selectedNodeIds={new Set()}
          onToggleStack={onToggleStack}
        />
      );
    });
    await act(async () => {
      await wait(350);
    });

    expect(container.textContent).toContain('+11 more');
    expect(container.querySelector('.stacked-node-wrapper')).not.toBeNull();

    await act(async () => {
      container.querySelector('.stack-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleStack).toHaveBeenCalledWith('parent-1');
  });
});
