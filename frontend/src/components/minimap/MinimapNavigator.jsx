import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

import './minimapNavigator.css';

const DEFAULT_MINIMAP_WIDTH = 320;
const DEFAULT_MINIMAP_HEIGHT = 110;
const MINIMAP_PADDING = 0;
const GUTTER_WIDTH = 12;
const ZOOM_THUMB_WIDTH = 28;
const ZOOM_TRACK_HEIGHT = 6;
const VIEWPORT_MIN_SIZE = 8;

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

const parseHex = (hex) => {
  if (!hex) return null;
  const normalized = hex.replace('#', '');
  const isShort = normalized.length === 3;
  const r = parseInt(isShort ? normalized[0] + normalized[0] : normalized.slice(0, 2), 16);
  const g = parseInt(isShort ? normalized[1] + normalized[1] : normalized.slice(2, 4), 16);
  const b = parseInt(isShort ? normalized[2] + normalized[2] : normalized.slice(4, 6), 16);
  if ([r, g, b].some((val) => Number.isNaN(val))) return null;
  return { r, g, b };
};

const mixWithWhite = (hex, amount = 0.55) => {
  const rgb = parseHex(hex);
  if (!rgb) return '#94a3b8';
  const mix = (value) => Math.round(value + (255 - value) * amount);
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
};

const getBoundsFromLayout = (layout) => {
  if (!layout || !layout.nodes || layout.nodes.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  layout.nodes.forEach((node) => {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  });

  if (layout.connectors && layout.connectors.length > 0) {
    layout.connectors.forEach((connector) => {
      minX = Math.min(minX, connector.x1, connector.x2);
      minY = Math.min(minY, connector.y1, connector.y2);
      maxX = Math.max(maxX, connector.x1, connector.x2);
      maxY = Math.max(maxY, connector.y1, connector.y2);
    });
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
};

const MinimapNavigator = ({
  layout,
  bounds,
  canvasSize,
  pan,
  scale,
  colors,
  minScale = 0.1,
  maxScale = 2,
  onPanTo,
  onCenterOn,
  onZoomTo,
  onZoomIn,
  onZoomOut,
}) => {
  const previewRef = useRef(null);
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const [measuredSize, setMeasuredSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!previewRef.current) return;
    const node = previewRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setMeasuredSize({ width, height });
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const minimapWidth = measuredSize.width > 0 ? measuredSize.width : DEFAULT_MINIMAP_WIDTH;
  const minimapHeight = measuredSize.height > 0 ? measuredSize.height : DEFAULT_MINIMAP_HEIGHT;

  const worldBounds = bounds || getBoundsFromLayout(layout);
  if (!worldBounds) return null;

  const boundsW = Math.max(1, worldBounds.maxX - worldBounds.minX);
  const boundsH = Math.max(1, worldBounds.maxY - worldBounds.minY);

  const innerRect = {
    x: MINIMAP_PADDING,
    y: MINIMAP_PADDING,
    w: Math.max(1, minimapWidth - MINIMAP_PADDING * 2),
    h: Math.max(1, minimapHeight - MINIMAP_PADDING * 2),
  };
  const visibleInner = {
    x: innerRect.x + GUTTER_WIDTH,
    y: innerRect.y,
    w: Math.max(1, innerRect.w - GUTTER_WIDTH * 2),
    h: innerRect.h,
  };

  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const safePan = {
    x: Number.isFinite(pan?.x) ? pan.x : 0,
    y: Number.isFinite(pan?.y) ? pan.y : 0,
  };

  const viewWorld = (canvasSize?.width && canvasSize?.height)
    ? {
        x: 0 / safeScale - safePan.x,
        y: 0 / safeScale - safePan.y,
        w: canvasSize.width / safeScale,
        h: canvasSize.height / safeScale,
      }
    : {
        x: worldBounds.minX,
        y: worldBounds.minY,
        w: Math.max(1, worldBounds.maxX - worldBounds.minX),
        h: Math.max(1, worldBounds.maxY - worldBounds.minY),
      };

  const miniScale = Math.max(0.0001, visibleInner.h / boundsH);
  const contentW = boundsW * miniScale;
  const contentH = boundsH * miniScale;
  const minContentLeft = visibleInner.x + visibleInner.w - contentW;
  const maxContentLeft = visibleInner.x;
  let contentLeft = visibleInner.x;
  const contentTop = visibleInner.y;

  if (contentW <= visibleInner.w) {
    contentLeft = visibleInner.x + (visibleInner.w - contentW) / 2;
  } else {
    const rawViewportX = contentLeft + (viewWorld.x - worldBounds.minX) * miniScale;
    const rawViewportW = viewWorld.w * miniScale;
    let desiredContentLeft = contentLeft;
    if (rawViewportX < visibleInner.x) {
      desiredContentLeft += visibleInner.x - rawViewportX;
    } else if (rawViewportX + rawViewportW > visibleInner.x + visibleInner.w) {
      desiredContentLeft += (visibleInner.x + visibleInner.w) - (rawViewportX + rawViewportW);
    }
    contentLeft = clampValue(desiredContentLeft, minContentLeft, maxContentLeft);
  }

  const atLeftEdge = contentW <= visibleInner.w || Math.abs(contentLeft - maxContentLeft) < 0.5;
  const atRightEdge = contentW <= visibleInner.w || Math.abs(contentLeft - minContentLeft) < 0.5;

  const mapW = contentW;
  const mapH = contentH;
  const mapX = contentLeft;
  const mapY = contentTop;

  const worldToMini = (worldX, worldY) => ({
    x: contentLeft + (worldX - worldBounds.minX) * miniScale,
    y: contentTop + (worldY - worldBounds.minY) * miniScale,
  });

  const rawViewportOrigin = worldToMini(viewWorld.x, viewWorld.y);
  const rawViewport = {
    x: rawViewportOrigin.x,
    y: rawViewportOrigin.y,
    w: viewWorld.w * miniScale,
    h: viewWorld.h * miniScale,
  };

  const clampedW = clampValue(rawViewport.w, VIEWPORT_MIN_SIZE, visibleInner.w);
  const clampedH = clampValue(rawViewport.h, VIEWPORT_MIN_SIZE, visibleInner.h);
  const maxX = visibleInner.x + visibleInner.w - clampedW;
  const maxY = visibleInner.y + visibleInner.h - clampedH;

  const viewport = {
    x: clampValue(rawViewport.x, visibleInner.x, maxX),
    y: clampValue(rawViewport.y, visibleInner.y, maxY),
    w: clampedW,
    h: clampedH,
  };

  const nodes = layout
    ? Array.from(layout.nodes.values()).map((node) => {
        const origin = worldToMini(node.x, node.y);
        const w = Math.max(2, node.w * miniScale);
        const h = Math.max(2, node.h * miniScale);
        const depth = node.depth ?? node?.node?.depth ?? 0;
        return { id: node.node.id, x: origin.x, y: origin.y, w, h, depth };
      })
    : [];

  const connectors = layout?.connectors
    ? layout.connectors.map((connector, idx) => {
        const p1 = worldToMini(connector.x1, connector.y1);
        const p2 = worldToMini(connector.x2, connector.y2);
        return { id: `${connector.type}-${idx}`, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      })
    : [];

  const clampOutputs = viewport;

  const getLocalPoint = (event) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const minimapToWorld = (minimapX, minimapY) => ({
    x: worldBounds.minX + (minimapX - contentLeft) / miniScale,
    y: worldBounds.minY + (minimapY - contentTop) / miniScale,
  });

  const zoomToClientX = (clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = clampValue((clientX - rect.left) / rect.width, 0, 1);
    const zoomRange = Math.max(0.001, maxScale - minScale);
    const nextScale = minScale + ratio * zoomRange;
    onZoomTo?.(nextScale);
  };

  const handlePointerDown = (event) => {
    if (!previewRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getLocalPoint(event);

    const isInsideViewport =
      point.x >= viewport.x &&
      point.x <= viewport.x + viewport.w &&
      point.y >= viewport.y &&
      point.y <= viewport.y + viewport.h;

    if (!isInsideViewport) {
      const world = minimapToWorld(point.x, point.y);
      onCenterOn?.(world.x, world.y);
      return;
    }

    dragRef.current = {
      mode: 'viewport',
      lastX: point.x,
      lastY: point.y,
    };
    previewRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current) return;
    event.preventDefault();
    const point = getLocalPoint(event);
    const deltaX = point.x - dragRef.current.lastX;
    const deltaY = point.y - dragRef.current.lastY;
    dragRef.current.lastX = point.x;
    dragRef.current.lastY = point.y;

    const deltaWorldX = deltaX / miniScale;
    const deltaWorldY = deltaY / miniScale;

    const worldLeft = viewWorld.x + deltaWorldX;
    const worldTop = viewWorld.y + deltaWorldY;

    onPanTo?.(worldLeft, worldTop);
  };

  const handlePointerUp = (event) => {
    if (!dragRef.current) return;
    event.preventDefault();
    dragRef.current = null;
    try {
      previewRef.current?.releasePointerCapture(event.pointerId);
    } catch {}
  };

  const zoomRatio = clampValue(
    (scale - minScale) / Math.max(0.001, maxScale - minScale),
    0,
    1
  );
  const thumbLeft = `calc(${(zoomRatio * 100).toFixed(4)}% - ${ZOOM_THUMB_WIDTH / 2}px)`;

  const showDebug =
    typeof window !== 'undefined' && window.location.search.includes('minimapDebug');

  return (
    <div
      className="minimap-navigator"
      role="presentation"
      data-edge-left={atLeftEdge ? 'true' : 'false'}
      data-edge-right={atRightEdge ? 'true' : 'false'}
    >
      <div
        className="minimap-navigator-preview"
        ref={previewRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <svg
          className="minimap-navigator-svg"
          width={minimapWidth}
          height={minimapHeight}
          viewBox={`0 0 ${minimapWidth} ${minimapHeight}`}
          aria-hidden="true"
        >
          <rect
            x={mapX}
            y={mapY}
            width={mapW}
            height={mapH}
            className="minimap-navigator-map"
            rx="8"
          />
          <defs>
            <clipPath id="minimap-navigator-clip">
              <rect
                x={innerRect.x}
                y={innerRect.y}
                width={innerRect.w}
                height={innerRect.h}
              />
            </clipPath>
          </defs>
          <g clipPath="url(#minimap-navigator-clip)">
            {connectors.map((connector) => (
              <line
                key={connector.id}
                x1={connector.x1}
                y1={connector.y1}
                x2={connector.x2}
                y2={connector.y2}
                className="minimap-navigator-connector"
              />
            ))}
            {nodes.map((node) => {
              const depthColor = colors?.[Math.min(node.depth, Math.max(0, (colors?.length || 1) - 1))];
              const baseColor = depthColor || '#94a3b8';
              const tintColor = mixWithWhite(baseColor, 0.6);
              const centerX = node.x + node.w / 2;
              const centerY = node.y + node.h / 2;
              const inside =
                centerX >= viewport.x &&
                centerX <= viewport.x + viewport.w &&
                centerY >= viewport.y &&
                centerY <= viewport.y + viewport.h;
              return (
                <rect
                  key={node.id}
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                className="minimap-navigator-node"
                style={{ fill: inside ? baseColor : tintColor }}
                rx="2"
              />
              );
            })}
          </g>
          <rect
            x={viewport.x}
            y={viewport.y}
            width={viewport.w}
            height={viewport.h}
            className="minimap-navigator-viewport"
            rx="0"
          />
        </svg>
        <div className="minimap-navigator-gutter minimap-navigator-gutter-left" />
        <div className="minimap-navigator-fade minimap-navigator-fade-left" />
        <div className="minimap-navigator-gutter minimap-navigator-gutter-right" />
        <div className="minimap-navigator-fade minimap-navigator-fade-right" />
      </div>
      <div className="minimap-navigator-zoom-row">
        <button
          type="button"
          className="minimap-navigator-zoom-btn"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onZoomOut?.();
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          aria-label="Zoom out"
        >
          <Minus size={14} />
        </button>
        <div
          ref={trackRef}
          className="minimap-navigator-track"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = { mode: 'zoom' };
            event.currentTarget.setPointerCapture(event.pointerId);
            zoomToClientX(event.clientX);
          }}
          onPointerMove={(event) => {
            if (dragRef.current?.mode !== 'zoom') return;
            event.preventDefault();
            zoomToClientX(event.clientX);
          }}
          onPointerUp={(event) => {
            if (dragRef.current?.mode !== 'zoom') return;
            event.preventDefault();
            dragRef.current = null;
            try {
              event.currentTarget.releasePointerCapture(event.pointerId);
            } catch {}
          }}
        >
          <div
            className="minimap-navigator-thumb"
            style={{
              width: ZOOM_THUMB_WIDTH,
              left: thumbLeft,
            }}
          />
        </div>
        <button
          type="button"
          className="minimap-navigator-zoom-btn"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onZoomIn?.();
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          aria-label="Zoom in"
        >
          <Plus size={14} />
        </button>
      </div>
      {showDebug && (
        <div className="minimap-navigator-debug" aria-hidden="true">
          <div>miniScale: {miniScale.toFixed(4)}</div>
          <div>contentLeft: {contentLeft.toFixed(1)} contentTop: {contentTop.toFixed(1)}</div>
          <div>worldLeft: {viewWorld.x.toFixed(1)}</div>
          <div>worldTop: {viewWorld.y.toFixed(1)}</div>
          <div>worldW: {viewWorld.w.toFixed(1)}</div>
          <div>worldH: {viewWorld.h.toFixed(1)}</div>
          <div>viewport: {viewport.x.toFixed(1)}, {viewport.y.toFixed(1)}, {viewport.w.toFixed(1)}, {viewport.h.toFixed(1)}</div>
        </div>
      )}
    </div>
  );
};

export default MinimapNavigator;
