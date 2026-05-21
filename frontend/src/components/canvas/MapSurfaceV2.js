import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getDepthColor } from '../../utils/constants';
import { DraggableNodeCard } from '../nodes/NodeCard';

const SCENE_OVERSCAN_PX = 1400;
const SCENE_FETCH_IDLE_MS = 120;
const MAX_HEAP_MB_BEFORE_SAFE_MODE = 900;

const getConnectorPath = (connector) => (
  `M ${connector.x1} ${connector.y1} L ${connector.x2} ${connector.y2}`
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
}) => {
  const surfaceRef = useRef(null);
  const worldRef = useRef(null);
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

  const applyWorldTransform = useCallback((view) => {
    const world = worldRef.current;
    if (!world) return;
    const transform = `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.scale})`;
    if (transform === lastTransformRef.current) return;
    lastTransformRef.current = transform;
    world.style.transform = transform;
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
      overscan: SCENE_OVERSCAN_PX,
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
      applyWorldTransform(view);
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
  }, [applyWorldTransform, fetchScene, getCurrentView]);

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

  const handleViewImage = useCallback((source, isDirectImage, nodeId, captureType) => {
    if (onViewImage) {
      onViewImage(source, isDirectImage, nodeId, captureType);
      return;
    }
    onNodeExpand?.({ id: nodeId, url: source });
  }, [onNodeExpand, onViewImage]);

  const renderThumbnails = showThumbnails && !safeMode;

  return (
    <div className="large-map-surface-v2" data-large-map-surface="1" ref={surfaceRef}>
      <div
        ref={worldRef}
        className="large-map-world sitemap-tree-absolute"
        style={{
          width: scene?.bounds?.w || 1,
          height: scene?.bounds?.h || 1,
          minWidth: scene?.bounds?.w || 1,
          minHeight: scene?.bounds?.h || 1,
        }}
        data-layout-node-count={scene?.nodeCount || 0}
        data-rendered-node-count={sceneNodes.length}
        data-rendered-connector-count={scene?.visibleConnectorCount || 0}
      >
        <svg className="connector-overlay" aria-hidden="true">
          {connectorPaths.map((path, index) => (
            <path
              key={`${path}-${index}`}
              d={path}
              fill="none"
              stroke="var(--ui-connection-map-default)"
              strokeWidth="var(--ui-connection-map-stroke-width)"
            />
          ))}
        </svg>

        {sceneNodes.map((nodeData) => {
          const node = nodeData.node;
          const isRoot = scene?.homeNode?.id === node.id;
          const isSelected = selectedNodeIds?.has(node.id);
          const isBranchDragging = activeBranchNodeIds?.has(node.id);
          return (
            <div
              key={node.id}
              className="sitemap-node-positioned"
              data-node-id={node.id}
              data-depth={node.depth}
              style={{
                position: 'absolute',
                left: node.x,
                top: node.y,
              }}
              onDoubleClick={() => onNodeDoubleClick?.(node)}
              onClick={(event) => onNodeClick?.(node, event)}
              onContextMenu={(event) => onNodeContextMenu?.(node.id, event)}
            >
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
                isSelected={isSelected}
              />
            </div>
          );
        })}
      </div>

      {loading && <div className="large-map-surface-status">Loading map surface...</div>}
      {error && <div className="large-map-surface-status large-map-surface-error">{error}</div>}
      {safeMode && <div className="large-map-performance-pill">Performance mode</div>}
    </div>
  );
};

export default MapSurfaceV2;
