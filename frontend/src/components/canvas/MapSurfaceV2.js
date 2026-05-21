import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getDepthColor } from '../../utils/constants';
import { CanvasImageCache, getThumbnailLodForScale } from '../../utils/canvasImageCache';

const SCENE_OVERSCAN_PX = 1400;
const SCENE_FETCH_IDLE_MS = 120;
const MAX_VISIBLE_THUMBNAILS = 90;
const MAX_HEAP_MB_BEFORE_SAFE_MODE = 700;

const getCssColor = (element, token, fallback) => {
  if (!element || typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(element).getPropertyValue(token).trim();
  return value || fallback;
};

const drawRoundRect = (ctx, x, y, w, h, r) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const drawText = (ctx, text, x, y, maxWidth) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return;
  if (ctx.measureText(value).width <= maxWidth) {
    ctx.fillText(value, x, y);
    return;
  }
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${value.slice(0, mid)}...`;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  ctx.fillText(`${value.slice(0, Math.max(1, lo))}...`, x, y);
};

const getNodeAtPoint = (nodes, worldX, worldY) => {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (
      worldX >= node.x
      && worldX <= node.x + node.w
      && worldY >= node.y
      && worldY <= node.y + node.h
    ) {
      return node;
    }
  }
  return null;
};

const getWorldPoint = (event, canvas, view) => {
  const rect = canvas.getBoundingClientRect();
  const scale = view.scale || 1;
  return {
    screenX: event.clientX - rect.left,
    screenY: event.clientY - rect.top,
    x: (event.clientX - rect.left - view.pan.x) / scale,
    y: (event.clientY - rect.top - view.pan.y) / scale,
  };
};

const isExpandHotspot = (node, screenX, screenY, view) => {
  if (!node || (view.scale || 1) < 0.45) return false;
  const x = node.x * view.scale + view.pan.x;
  const y = node.y * view.scale + view.pan.y;
  const size = 28;
  return screenX >= x + node.w * view.scale - size - 8
    && screenX <= x + node.w * view.scale - 8
    && screenY >= y + 8
    && screenY <= y + size + 8;
};

const MapSurfaceV2 = ({
  mapId,
  getScene,
  getViewState,
  canvasSize,
  orientation,
  showThumbnails,
  colors,
  selectedNodeIds,
  onNodeClick,
  onNodeContextMenu,
  onNodeDoubleClick,
  onNodeExpand,
}) => {
  const canvasRef = useRef(null);
  const imageCacheRef = useRef(null);
  const sceneRef = useRef(null);
  const fetchTimerRef = useRef(null);
  const fetchAbortRef = useRef(null);
  const lastFetchKeyRef = useRef('');
  const lastDrawKeyRef = useRef('');
  const latestPropsRef = useRef({});
  const [scene, setScene] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [safeMode, setSafeMode] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  if (!imageCacheRef.current) {
    imageCacheRef.current = new CanvasImageCache({ maxBytes: 42 * 1024 * 1024, maxConcurrent: 4 });
  }

  const selectedSignature = useMemo(() => (
    Array.from(selectedNodeIds || []).sort().join('|')
  ), [selectedNodeIds]);

  useEffect(() => {
    latestPropsRef.current = {
      selectedNodeIds,
      selectedSignature,
      hoveredNodeId,
      safeMode,
      showThumbnails,
      colors,
    };
  }, [colors, hoveredNodeId, safeMode, selectedNodeIds, selectedSignature, showThumbnails]);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  const getCurrentView = useCallback(() => {
    const view = getViewState?.() || {};
    return {
      pan: {
        x: Number(view.pan?.x || 0),
        y: Number(view.pan?.y || 0),
      },
      scale: Math.max(0.05, Number(view.scale || 1)),
    };
  }, [getViewState]);

  const getSceneParams = useCallback((view) => {
    const width = Math.max(1, Number(canvasSize?.width || canvasRef.current?.clientWidth || window.innerWidth || 1));
    const height = Math.max(1, Number(canvasSize?.height || canvasRef.current?.clientHeight || window.innerHeight || 1));
    return {
      x: (0 - view.pan.x) / view.scale,
      y: (0 - view.pan.y) / view.scale,
      w: width / view.scale,
      h: height / view.scale,
      zoom: view.scale,
      orientation,
      thumbnails: showThumbnails && !safeMode ? '1' : '0',
      overscan: SCENE_OVERSCAN_PX,
    };
  }, [canvasSize?.height, canvasSize?.width, orientation, safeMode, showThumbnails]);

  const fetchScene = useCallback((view) => {
    if (!mapId || !getScene) return;
    const params = getSceneParams(view);
    const fetchKey = [
      Math.round(params.x / 180),
      Math.round(params.y / 180),
      Math.round(params.w / 180),
      Math.round(params.h / 180),
      Math.round(params.zoom * 100) / 100,
      params.orientation,
      params.thumbnails,
    ].join(':');
    if (fetchKey === lastFetchKeyRef.current) return;
    lastFetchKeyRef.current = fetchKey;
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    fetchTimerRef.current = setTimeout(async () => {
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      try {
        const response = await getScene(mapId, params, { signal: controller.signal });
        const nextScene = response?.scene || null;
        if (!nextScene || controller.signal.aborted) return;
        setScene(nextScene);
        setError('');
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err?.message || 'Map surface failed to load');
        setLoading(false);
      }
    }, SCENE_FETCH_IDLE_MS);
  }, [getScene, getSceneParams, mapId]);

  const requestVisibleImages = useCallback((nodes, view) => {
    const cache = imageCacheRef.current;
    if (!cache || !showThumbnails || safeMode || getThumbnailLodForScale(view.scale) === 'none') {
      cache?.retain([]);
      return;
    }
    const urls = nodes
      .filter((node) => node.thumbnailUrl)
      .map((node) => ({
        url: node.thumbnailUrl,
        area: Math.max(1, node.w * view.scale) * Math.max(1, node.h * view.scale),
      }))
      .sort((left, right) => right.area - left.area)
      .slice(0, MAX_VISIBLE_THUMBNAILS)
      .map((entry) => entry.url);
    cache.retain(urls);
    urls.forEach((url) => cache.request(url));
  }, [safeMode, showThumbnails]);

  const draw = useCallback((force = false) => {
    const canvas = canvasRef.current;
    const currentScene = sceneRef.current;
    if (!canvas || !currentScene) return;
    const view = getCurrentView();
    const width = Math.max(1, canvas.clientWidth || canvasSize?.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvasSize?.height || 1);
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, latestPropsRef.current.safeMode ? 1 : 1.5));
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const drawKey = [
      Math.round(view.pan.x),
      Math.round(view.pan.y),
      Math.round(view.scale * 1000),
      Math.round(currentScene.viewport?.x || 0),
      Math.round(currentScene.viewport?.y || 0),
      currentScene.visibleNodeCount,
      currentScene.thumbnailLod || '',
      latestPropsRef.current.selectedSignature,
      latestPropsRef.current.hoveredNodeId || '',
      latestPropsRef.current.safeMode ? 'safe' : 'normal',
      imageCacheRef.current?.bytes || 0,
    ].join(':');
    if (!force && drawKey === lastDrawKeyRef.current && imageCacheRef.current?.pending?.size === 0) return;
    lastDrawKeyRef.current = drawKey;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const borderColor = getCssColor(canvas, '--ui-border-subtle', '#d7dde7');
    const textColor = getCssColor(canvas, '--ui-text-primary', '#111827');
    const mutedColor = getCssColor(canvas, '--ui-text-secondary', '#64748b');
    const surfaceColor = getCssColor(canvas, '--ui-surface-elevated', '#ffffff');
    const selectedColor = getCssColor(canvas, '--ui-color-brand-primary', '#1f766d');
    const connectorColor = getCssColor(canvas, '--ui-connection-map-default', '#94a3b8');
    const nodes = currentScene.nodes || [];
    requestVisibleImages(nodes, view);

    ctx.save();
    ctx.translate(view.pan.x, view.pan.y);
    ctx.scale(view.scale, view.scale);
    ctx.strokeStyle = connectorColor;
    ctx.lineWidth = Math.max(1.5 / view.scale, 1);
    ctx.globalAlpha = view.scale < 0.12 ? 0.35 : 0.65;
    (currentScene.connectors || []).forEach((connector) => {
      ctx.beginPath();
      ctx.moveTo(connector.x1, connector.y1);
      ctx.lineTo(connector.x2, connector.y2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    nodes.forEach((node) => {
      const selected = latestPropsRef.current.selectedNodeIds?.has(node.id);
      const hovered = latestPropsRef.current.hoveredNodeId === node.id;
      drawRoundRect(ctx, node.x, node.y, node.w, node.h, 8);
      ctx.fillStyle = surfaceColor;
      ctx.fill();
      ctx.strokeStyle = selected ? selectedColor : (hovered ? mutedColor : borderColor);
      ctx.lineWidth = selected ? Math.max(3 / view.scale, 2) : Math.max(1 / view.scale, 1);
      ctx.stroke();

      ctx.fillStyle = getDepthColor(latestPropsRef.current.colors, node.depth);
      ctx.fillRect(node.x, node.y, 6, node.h);

      const cacheImage = node.thumbnailUrl ? imageCacheRef.current?.get(node.thumbnailUrl) : null;
      const shouldDrawThumb = cacheImage
        && latestPropsRef.current.showThumbnails
        && !latestPropsRef.current.safeMode
        && getThumbnailLodForScale(view.scale) !== 'none';
      if (shouldDrawThumb) {
        const thumbX = node.x + 14;
        const thumbY = node.y + 40;
        const thumbW = node.w - 28;
        const thumbH = Math.min(132, node.h - 88);
        drawRoundRect(ctx, thumbX, thumbY, thumbW, thumbH, 6);
        ctx.save();
        ctx.clip();
        ctx.drawImage(cacheImage, thumbX, thumbY, thumbW, thumbH);
        ctx.restore();
      }

      if (view.scale >= 0.18) {
        ctx.fillStyle = textColor;
        ctx.font = '600 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        drawText(ctx, `${node.number ? `${node.number} ` : ''}${node.title}`, node.x + 16, node.y + 25, node.w - 52);
      }
      if (view.scale >= 0.5) {
        ctx.fillStyle = mutedColor;
        ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        drawText(ctx, node.url, node.x + 16, node.y + node.h - 22, node.w - 32);
      }
      if (view.scale >= 0.45) {
        const iconSize = 24;
        const iconX = node.x + node.w - iconSize - 10;
        const iconY = node.y + 10;
        ctx.strokeStyle = mutedColor;
        ctx.lineWidth = Math.max(1.5 / view.scale, 1);
        ctx.strokeRect(iconX, iconY, iconSize, iconSize);
        ctx.beginPath();
        ctx.moveTo(iconX + 8, iconY + 16);
        ctx.lineTo(iconX + 16, iconY + 8);
        ctx.moveTo(iconX + 11, iconY + 8);
        ctx.lineTo(iconX + 16, iconY + 8);
        ctx.lineTo(iconX + 16, iconY + 13);
        ctx.stroke();
      }
    });
    ctx.restore();

    const memory = typeof performance !== 'undefined' && performance?.memory?.usedJSHeapSize
      ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
      : null;
    if (memory && memory > MAX_HEAP_MB_BEFORE_SAFE_MODE && !latestPropsRef.current.safeMode) {
      setSafeMode(true);
    }
  }, [canvasSize?.height, canvasSize?.width, getCurrentView, requestVisibleImages]);

  useEffect(() => {
    fetchScene(getCurrentView());
  }, [fetchScene, getCurrentView, orientation, safeMode, showThumbnails]);

  useEffect(() => {
    let raf = null;
    const tick = () => {
      const view = getCurrentView();
      fetchScene(view);
      draw(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [draw, fetchScene, getCurrentView]);

  useEffect(() => () => {
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    imageCacheRef.current?.clear();
  }, []);

  useEffect(() => {
    if (safeMode) imageCacheRef.current?.clear();
  }, [safeMode]);

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return undefined;
    let longTaskMs = 0;
    let observer = null;
    try {
      observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          longTaskMs += Number(entry.duration || 0);
        });
        if (longTaskMs > 600) setSafeMode(true);
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      return undefined;
    }
    return () => observer?.disconnect();
  }, []);

  const handlePointerMove = (event) => {
    const canvas = canvasRef.current;
    const currentScene = sceneRef.current;
    if (!canvas || !currentScene) return;
    const view = getCurrentView();
    const point = getWorldPoint(event, canvas, view);
    const node = getNodeAtPoint(currentScene.nodes || [], point.x, point.y);
    const nextId = node?.id || null;
    if (nextId !== hoveredNodeId) setHoveredNodeId(nextId);
    canvas.style.cursor = node ? 'pointer' : 'default';
  };

  const handleClick = (event) => {
    const canvas = canvasRef.current;
    const currentScene = sceneRef.current;
    if (!canvas || !currentScene) return;
    const view = getCurrentView();
    const point = getWorldPoint(event, canvas, view);
    const node = getNodeAtPoint(currentScene.nodes || [], point.x, point.y);
    if (!node) return;
    if (isExpandHotspot(node, point.screenX, point.screenY, view)) {
      onNodeExpand?.(node, event);
      return;
    }
    onNodeClick?.(node, event);
  };

  const handleDoubleClick = (event) => {
    const canvas = canvasRef.current;
    const currentScene = sceneRef.current;
    if (!canvas || !currentScene) return;
    const view = getCurrentView();
    const point = getWorldPoint(event, canvas, view);
    const node = getNodeAtPoint(currentScene.nodes || [], point.x, point.y);
    if (node) onNodeDoubleClick?.(node, event);
  };

  const handleContextMenu = (event) => {
    const canvas = canvasRef.current;
    const currentScene = sceneRef.current;
    if (!canvas || !currentScene) return;
    const view = getCurrentView();
    const point = getWorldPoint(event, canvas, view);
    const node = getNodeAtPoint(currentScene.nodes || [], point.x, point.y);
    if (node) {
      onNodeContextMenu?.(node.id, event);
    }
  };

  return (
    <div className="large-map-surface-v2" data-large-map-surface="1">
      <canvas
        ref={canvasRef}
        className="large-map-canvas"
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        aria-label="Large map canvas"
      />
      {loading && <div className="large-map-surface-status">Loading map surface...</div>}
      {error && <div className="large-map-surface-status large-map-surface-error">{error}</div>}
      {safeMode && <div className="large-map-performance-pill">Performance mode</div>}
    </div>
  );
};

export default MapSurfaceV2;
