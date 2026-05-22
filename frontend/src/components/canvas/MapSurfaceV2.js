import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { getDepthColor } from '../../utils/constants';
import { DraggableNodeCard } from '../nodes/NodeCard';

const SCENE_FETCH_IDLE_MS = 80;
const MAX_HEAP_MB_BEFORE_SAFE_MODE = 900;

const getConnectorPath = (connector) => (
  `M ${connector.x1} ${connector.y1} L ${connector.x2} ${connector.y2}`
);

const getSceneOverscan = (scale) => {
  if (scale < 0.2) return 3600;
  if (scale < 0.5) return 2600;
  return 1800;
};

const getNodeTransform = (node, view) => (
  `translate(${node.x * view.scale + view.pan.x}px, ${node.y * view.scale + view.pan.y}px) scale(${view.scale})`
);

const toSceneNodeData = (node) => ({
  ...node,
  node,
});

const MapSurfaceV2 = ({
  mapId,
  getScene,
  getViewState,
  canvasSize,
  orientation,
  showThumbnails,
  showCommentBadges,
  canEdit,
  canComment,
  showCommentAction,
  commentActionLabel,
  showExternalLinkAction,
  showDeleteAction,
  connectionTool,
  snapTarget,
  onAnchorMouseDown,
  colors,
  selectedNodeIds,
  onNodeClick,
  onNodeContextMenu,
  onNodeDoubleClick,
  onNodeExpand,
  onViewImage,
  onDelete,
  onEdit,
  onDuplicate,
  onAddNote,
  onViewNotes,
  activeId,
  showPageNumbers,
  thumbnailRequestIds,
  thumbnailSessionId,
  thumbnailReloadMap,
  thumbnailCaptureStopped,
  onThumbnailLoad,
  onThumbnailError,
  onSceneLoaded,
  activeBranchNodeIds,
  expandedStacks,
  onToggleStack,
}) => {
  const surfaceRef = useRef(null);
  const worldRef = useRef(null);
  const connectorGroupRef = useRef(null);
  const sceneRef = useRef(null);
  const fetchTimerRef = useRef(null);
  const fetchAbortRef = useRef(null);
  const lastFetchKeyRef = useRef('');
  const lastTransformRef = useRef('');
  const [scene, setScene] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [safeMode, setSafeMode] = useState(false);

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

  const expandedStackIds = useMemo(() => (
    Object.entries(expandedStacks || {})
      .filter(([, expanded]) => !!expanded)
      .map(([id]) => id)
      .filter(Boolean)
      .sort()
  ), [expandedStacks]);

  const applyViewportTransform = useCallback((view, { force = false } = {}) => {
    const world = worldRef.current;
    const cssTransform = `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.scale})`;
    if (!force && cssTransform === lastTransformRef.current) return;
    lastTransformRef.current = cssTransform;
    if (connectorGroupRef.current) {
      connectorGroupRef.current.setAttribute('transform', `translate(${view.pan.x} ${view.pan.y}) scale(${view.scale})`);
    }
    if (!world) return;
    world.querySelectorAll('[data-large-map-node="1"]').forEach((element) => {
      const x = Number(element.getAttribute('data-world-x') || 0);
      const y = Number(element.getAttribute('data-world-y') || 0);
      element.style.transform = `translate(${x * view.scale + view.pan.x}px, ${y * view.scale + view.pan.y}px) scale(${view.scale})`;
    });
  }, []);

  const getSceneParams = useCallback((view) => {
    const width = Math.max(1, Number(canvasSize?.width || surfaceRef.current?.clientWidth || window.innerWidth || 1));
    const height = Math.max(1, Number(canvasSize?.height || surfaceRef.current?.clientHeight || window.innerHeight || 1));
    return {
      x: (0 - view.pan.x) / view.scale,
      y: (0 - view.pan.y) / view.scale,
      w: width / view.scale,
      h: height / view.scale,
      zoom: view.scale,
      orientation,
      thumbnails: showThumbnails && !safeMode ? '1' : '0',
      overscan: getSceneOverscan(view.scale),
      expandedStacks: expandedStackIds.join(','),
    };
  }, [canvasSize?.height, canvasSize?.width, expandedStackIds, orientation, safeMode, showThumbnails]);

  const fetchScene = useCallback((view) => {
    if (!mapId || !getScene) return;
    const params = getSceneParams(view);
    const fetchKey = [
      mapId,
      Math.round(params.x / 180),
      Math.round(params.y / 180),
      Math.round(params.w / 180),
      Math.round(params.h / 180),
      Math.round(params.zoom * 100) / 100,
      params.orientation,
      params.thumbnails,
      params.expandedStacks,
      params.overscan,
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
        onSceneLoaded?.(nextScene);
        setError('');
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err?.message || 'Map surface failed to load');
        setLoading(false);
      }
    }, SCENE_FETCH_IDLE_MS);
  }, [getScene, getSceneParams, mapId, onSceneLoaded]);

  useEffect(() => {
    fetchScene(getCurrentView());
  }, [fetchScene, getCurrentView, orientation, safeMode, showThumbnails]);

  useEffect(() => {
    let raf = null;
    const tick = () => {
      const view = getCurrentView();
      applyViewportTransform(view);
      fetchScene(view);
      const memory = typeof performance !== 'undefined' && performance?.memory?.usedJSHeapSize
        ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
        : null;
      if (memory && memory > MAX_HEAP_MB_BEFORE_SAFE_MODE) {
        setSafeMode(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [applyViewportTransform, fetchScene, getCurrentView]);

  useEffect(() => () => {
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
  }, []);

  const sceneNodes = useMemo(() => (
    (scene?.nodes || []).map(toSceneNodeData)
  ), [scene?.nodes]);

  const connectorPaths = useMemo(() => (
    (scene?.connectors || []).map(getConnectorPath)
  ), [scene?.connectors]);

  useLayoutEffect(() => {
    applyViewportTransform(getCurrentView(), { force: true });
  }, [applyViewportTransform, getCurrentView, scene?.nodes, scene?.connectors]);

  const handleViewImage = useCallback((source, isDirectImage, nodeId, captureType) => {
    if (onViewImage) {
      onViewImage(source, isDirectImage, nodeId, captureType);
      return;
    }
    onNodeExpand?.({ id: nodeId, url: source });
  }, [onNodeExpand, onViewImage]);

  const renderThumbnails = showThumbnails && !safeMode;
  const currentView = getCurrentView();
  const connectorTransform = `translate(${currentView.pan.x} ${currentView.pan.y}) scale(${currentView.scale})`;

  return (
    <div className="large-map-surface-v2" data-large-map-surface="1" ref={surfaceRef}>
      <div
        ref={worldRef}
        className="large-map-world sitemap-tree-absolute"
        data-layout-node-count={scene?.nodeCount || 0}
        data-rendered-node-count={sceneNodes.length}
        data-rendered-connector-count={scene?.visibleConnectorCount || 0}
      >
        <svg className="connector-overlay" aria-hidden="true">
          <g ref={connectorGroupRef} transform={connectorTransform}>
            {connectorPaths.map((path, index) => (
              <path
                key={`${path}-${index}`}
                d={path}
                fill="none"
                stroke="var(--ui-connection-map-default)"
                strokeWidth="var(--ui-connection-map-stroke-width)"
              />
            ))}
          </g>
        </svg>

        {sceneNodes.map((nodeData) => {
          const node = nodeData.node;
          const isRoot = scene?.homeNode?.id === node.id;
          const isSelected = selectedNodeIds?.has(node.id);
          const isBranchDragging = activeBranchNodeIds?.has(node.id);
          const stackInfo = node.stackInfo;
          const stackToggleParentId = stackInfo?.parentId;
          const shouldWrapStack = !!stackInfo?.collapsed;
          const card = (
            <DraggableNodeCard
              node={node}
              number={node.number}
              color={getDepthColor(colors, node.depth)}
              showThumbnails={renderThumbnails}
              showCommentBadges={showCommentBadges}
              canEdit={canEdit}
              canComment={canComment}
              showCommentAction={showCommentAction}
              commentActionLabel={commentActionLabel}
              showExternalLinkAction={showExternalLinkAction}
              showDeleteAction={showDeleteAction}
              connectionTool={connectionTool}
              snapTarget={snapTarget}
              onAnchorMouseDown={onAnchorMouseDown}
              isRoot={isRoot}
              onDelete={onDelete}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onViewImage={handleViewImage}
              onAddNote={onAddNote}
              onViewNotes={onViewNotes}
              activeId={isBranchDragging ? node.id : activeId}
              badges={[]}
              showPageNumbers={showPageNumbers}
              showAnnotations
              thumbnailRequestIds={thumbnailRequestIds}
              thumbnailSessionId={thumbnailSessionId}
              thumbnailReloadKey={thumbnailReloadMap?.[node.id] || 0}
              thumbnailCaptureStopped={thumbnailCaptureStopped}
              onThumbnailLoad={onThumbnailLoad}
              onThumbnailError={onThumbnailError}
              stackInfo={stackInfo}
              onToggleStack={() => {
                if (stackToggleParentId !== undefined && stackToggleParentId !== null) {
                  onToggleStack?.(stackToggleParentId);
                }
              }}
              isSelected={isSelected}
            />
          );
          return (
            <div
              key={node.id}
              className="sitemap-node-positioned"
              data-large-map-node="1"
              data-node-id={node.id}
              data-depth={node.depth}
              data-world-x={node.x}
              data-world-y={node.y}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: node.w,
                height: node.h,
                transform: getNodeTransform(node, currentView),
                transformOrigin: '0 0',
              }}
              onDoubleClick={() => onNodeDoubleClick?.(node)}
              onClick={(event) => onNodeClick?.(node, event)}
              onContextMenu={(event) => onNodeContextMenu?.(node.id, event)}
            >
              {shouldWrapStack ? (
                <div className="stacked-node-wrapper">
                  <div className="stacked-node-ghost stacked-node-ghost-3" />
                  <div className="stacked-node-ghost stacked-node-ghost-2" />
                  <div className="stacked-node-ghost stacked-node-ghost-1" />
                  {card}
                </div>
              ) : (
                card
              )}
            </div>
          );
        })}
      </div>

      {loading && <div className="large-map-surface-status">Loading map surface...</div>}
      {error && <div className="large-map-surface-status large-map-surface-error">{error}</div>}
    </div>
  );
};

export default MapSurfaceV2;
