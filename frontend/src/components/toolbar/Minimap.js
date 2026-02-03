import React, { useMemo, useRef } from 'react';

const MINIMAP_WIDTH = 220;
const MINIMAP_MIN_HEIGHT = 120;
const MINIMAP_MAX_HEIGHT = 240;
const MINIMAP_PADDING = 8;
const MINIMAP_TRACK_HEIGHT = 8;

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

const Minimap = ({
  layout,
  bounds,
  canvasSize,
  pan,
  scale,
  minScale = 0.1,
  maxScale = 2,
  onPanTo,
  onCenterOn,
  onZoomTo,
}) => {
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  const minimapSize = useMemo(() => {
    if (!bounds) return { width: MINIMAP_WIDTH, height: MINIMAP_MIN_HEIGHT };
    const mapWidth = Math.max(1, bounds.maxX - bounds.minX);
    const mapHeight = Math.max(1, bounds.maxY - bounds.minY);
    const targetHeight = Math.round((mapHeight / mapWidth) * MINIMAP_WIDTH);
    const height = clampValue(targetHeight, MINIMAP_MIN_HEIGHT, MINIMAP_MAX_HEIGHT);
    return { width: MINIMAP_WIDTH, height };
  }, [bounds]);

  const metrics = useMemo(() => {
    if (!bounds) return null;
    const mapWidth = Math.max(1, bounds.maxX - bounds.minX);
    const mapHeight = Math.max(1, bounds.maxY - bounds.minY);
    const innerW = minimapSize.width - MINIMAP_PADDING * 2;
    const innerH = minimapSize.height - MINIMAP_PADDING * 2 - MINIMAP_TRACK_HEIGHT - 10;
    const scaleToFit = innerH / mapHeight;
    const scaledW = mapWidth * scaleToFit;
    const scaledH = mapHeight * scaleToFit;
    const offsetX = MINIMAP_PADDING + (innerW - scaledW) / 2;
    const offsetY = MINIMAP_PADDING;
    return {
      mapWidth,
      mapHeight,
      scale: scaleToFit,
      offsetX,
      offsetY,
      scaledW,
      scaledH,
      mapLeft: offsetX,
      mapTop: offsetY,
      mapRight: offsetX + scaledW,
      mapBottom: offsetY + scaledH,
      innerW,
      innerH,
    };
  }, [bounds, minimapSize]);

  const viewWorld = useMemo(() => {
    if (!bounds) return null;
    if (!canvasSize?.width || !canvasSize?.height) {
      return {
        x: bounds.minX,
        y: bounds.minY,
        w: Math.max(1, bounds.maxX - bounds.minX),
        h: Math.max(1, bounds.maxY - bounds.minY),
      };
    }
    return {
      x: -pan.x / scale,
      y: -pan.y / scale,
      w: canvasSize.width / scale,
      h: canvasSize.height / scale,
    };
  }, [pan, scale, canvasSize, bounds]);

  const viewport = useMemo(() => {
    if (!metrics || !viewWorld) return null;
    const maxViewportW = Math.min(metrics.innerW, metrics.scaledW);
    const maxViewportH = Math.min(metrics.innerH, metrics.scaledH);
    let viewW = Math.min(viewWorld.w * metrics.scale, maxViewportW);
    let viewH = Math.min(viewWorld.h * metrics.scale, maxViewportH);

    const maxRatio = 2;
    const minRatio = 1 / maxRatio;
    const ratio = viewW / Math.max(1, viewH);
    if (ratio > maxRatio) {
      viewW = viewH * maxRatio;
    } else if (ratio < minRatio) {
      viewH = viewW / minRatio;
    }

    viewW = Math.min(viewW, maxViewportW);
    viewH = Math.min(viewH, maxViewportH);

    const centerX =
      metrics.mapLeft + (viewWorld.x + viewWorld.w / 2 - bounds.minX) * metrics.scale;
    const centerY =
      metrics.mapTop + (viewWorld.y + viewWorld.h / 2 - bounds.minY) * metrics.scale;
    const rawX = centerX - viewW / 2;
    const rawY = centerY - viewH / 2;
    const clampedX = clampValue(rawX, metrics.mapLeft, metrics.mapRight - viewW);
    const clampedY = clampValue(rawY, metrics.mapTop, metrics.mapBottom - viewH);

    return {
      x: clampedX,
      y: clampedY,
      w: viewW,
      h: viewH,
    };
  }, [metrics, bounds, viewWorld]);

  const track = useMemo(() => {
    if (!metrics) return null;
    const trackWidth = minimapSize.width - MINIMAP_PADDING * 2;
    const trackX = MINIMAP_PADDING;
    const trackY = minimapSize.height - MINIMAP_PADDING - MINIMAP_TRACK_HEIGHT;
    const thumbWidth = 28;
    const travelWidth = Math.max(1, trackWidth - thumbWidth);
    const zoomRange = Math.max(0.001, maxScale - minScale);
    const ratio = clampValue((scale - minScale) / zoomRange, 0, 1);
    const thumbX = trackX + ratio * travelWidth;
    return {
      x: trackX,
      y: trackY,
      width: trackWidth,
      height: MINIMAP_TRACK_HEIGHT,
      thumbX,
      thumbWidth,
    };
  }, [metrics, minimapSize, scale, minScale, maxScale]);

  const nodes = useMemo(() => {
    if (!layout || !metrics) return [];
    return Array.from(layout.nodes.values()).map((node) => {
      const x = metrics.offsetX + (node.x - bounds.minX) * metrics.scale;
      const y = metrics.offsetY + (node.y - bounds.minY) * metrics.scale;
      const w = Math.max(2, node.w * metrics.scale);
      const h = Math.max(2, node.h * metrics.scale);
      return { id: node.node.id, x, y, w, h };
    });
  }, [layout, metrics, bounds]);

  if (!layout || !bounds || !metrics || !viewport || !track) return null;

  const getLocalPoint = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const panToViewport = (nextX, nextY) => {
    const clampedX = clampValue(nextX, metrics.mapLeft, metrics.mapRight - viewport.w);
    const clampedY = clampValue(nextY, metrics.mapTop, metrics.mapBottom - viewport.h);
    const worldX = bounds.minX + (clampedX - metrics.mapLeft) / metrics.scale;
    const worldY = bounds.minY + (clampedY - metrics.mapTop) / metrics.scale;
    onPanTo?.(worldX, worldY);
  };

  const zoomToTrack = (thumbLeft) => {
    const travelWidth = Math.max(1, track.width - track.thumbWidth);
    const ratio = clampValue((thumbLeft - track.x) / travelWidth, 0, 1);
    const zoomRange = Math.max(0.001, maxScale - minScale);
    const nextScale = minScale + ratio * zoomRange;
    onZoomTo?.(nextScale);
  };

  const handlePointerDown = (e) => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const point = getLocalPoint(e);
    const isOnTrack = point.y >= track.y && point.y <= track.y + track.height;
    if (isOnTrack) {
      dragRef.current = {
        mode: 'zoom',
        offsetX: point.x - track.thumbX,
      };
      zoomToTrack(point.x - dragRef.current.offsetX);
      containerRef.current.setPointerCapture(e.pointerId);
      return;
    }
    const isInsideViewport =
      point.x >= viewport.x &&
      point.x <= viewport.x + viewport.w &&
      point.y >= viewport.y &&
      point.y <= viewport.y + viewport.h;

    if (!isInsideViewport) {
      const worldX = bounds.minX + (point.x - metrics.mapLeft) / metrics.scale;
      const worldY = bounds.minY + (point.y - metrics.mapTop) / metrics.scale;
      onCenterOn?.(worldX, worldY);
    }

    const offsetX = isInsideViewport ? point.x - viewport.x : viewport.w / 2;
    const offsetY = isInsideViewport ? point.y - viewport.y : viewport.h / 2;
    dragRef.current = { mode: 'viewport', offsetX, offsetY };
    containerRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const point = getLocalPoint(e);
    if (dragRef.current.mode === 'zoom') {
      zoomToTrack(point.x - dragRef.current.offsetX);
      return;
    }
    panToViewport(point.x - dragRef.current.offsetX, point.y - dragRef.current.offsetY);
  };

  const handlePointerUp = (e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    dragRef.current = null;
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const hasHorizontalOverflow = metrics.scaledW > metrics.innerW + 1;

  return (
    <div
      className={`minimap${hasHorizontalOverflow ? ' minimap--fade' : ''}`}
      style={{ width: minimapSize.width, height: minimapSize.height }}
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      role="presentation"
    >
      <svg
        width={minimapSize.width}
        height={minimapSize.height}
        viewBox={`0 0 ${minimapSize.width} ${minimapSize.height}`}
        aria-hidden="true"
      >
        <rect
          x={metrics.mapLeft}
          y={metrics.mapTop}
          width={metrics.scaledW}
          height={metrics.scaledH}
          className="minimap-map"
          rx="12"
        />
        {nodes.map((node) => (
          <rect
            key={node.id}
            x={node.x}
            y={node.y}
            width={node.w}
            height={node.h}
            className="minimap-node"
            rx="2"
          />
        ))}
        <rect
          x={viewport.x}
          y={viewport.y}
          width={viewport.w}
          height={viewport.h}
          className="minimap-viewport-fill"
          rx="0"
        />
        <rect
          x={viewport.x}
          y={viewport.y}
          width={viewport.w}
          height={viewport.h}
          className="minimap-viewport"
          rx="0"
        />
      </svg>
      <div
        className="minimap-track"
        style={{
          left: track.x,
          top: track.y,
          width: track.width,
          height: track.height,
        }}
      >
        <div
          className="minimap-thumb"
          style={{
            left: track.thumbX - track.x,
            width: track.thumbWidth,
          }}
        />
      </div>
    </div>
  );
};

export default Minimap;
