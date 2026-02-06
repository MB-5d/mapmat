import React, { useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Edit2,
  ExternalLink,
  ImageOff,
  Loader2,
  Maximize2,
  MessageSquare,
  Trash2,
} from 'lucide-react';

import { getHostname } from '../../utils/url';
import { ANNOTATION_STATUS_LABELS } from '../../utils/constants';

const NodeCard = ({
  node,
  number,
  color,
  showThumbnails,
  showCommentBadges,
  canEdit,
  canComment,
  connectionTool,
  snapTarget,
  onAnchorMouseDown,
  onDelete,
  onEdit,
  onDuplicate,
  onViewImage,
  onAddNote,
  onViewNotes,
  isRoot,
  isDragging,
  isPressing,
  dragHandleProps,
  badges = [],
  showPageNumbers = true,
  showAnnotations = true,
  onRequestThumbnail,
  thumbnailRequestIds,
  thumbnailSessionId,
  thumbnailReloadKey = 0,
  thumbnailCaptureStopped = false,
  onThumbnailLoad,
  onThumbnailError,
  stackInfo,
  onToggleStack,
  isGhosted = false,
  isSelected = false,
}) => {
  const [thumbError, setThumbError] = useState(false);
  const [thumbLoading, setThumbLoading] = useState(true);
  const [thumbKey, setThumbKey] = useState(0);
  const thumbImgRef = useRef(null);

  const isScreenshotThumb = node.thumbnailUrl?.includes('/screenshots/');
  const thumb = node.thumbnailUrl
    ? `${node.thumbnailUrl}${node.thumbnailUrl.includes('?') ? '&' : '?'}_=${thumbKey}`
    : null;
  const hasThumb = Boolean(thumb);
  const canRequestThumbnail = !thumbnailRequestIds || thumbnailRequestIds.has(node.id);
  const annotations = node?.annotations || {};
  const status = annotations.status || 'none';
  const note = typeof annotations.note === 'string' ? annotations.note.trim() : '';
  const tags = Array.isArray(annotations.tags) ? annotations.tags : [];
  const hasTags = tags.length > 0;
  const hasStatus = status !== 'none';
  const showBadge = showAnnotations && (hasStatus || note || hasTags);
  const statusLabel = ANNOTATION_STATUS_LABELS[status] || 'Note';
  const badgeLabel = hasStatus ? statusLabel : (hasTags ? 'Tagged' : 'Note');
  const badgeTitleParts = [];
  if (hasStatus) badgeTitleParts.push(statusLabel);
  if (note) badgeTitleParts.push(note);
  if (tags.length > 0) badgeTitleParts.push(`Tags: ${tags.join(', ')}`);
  const badgeTitle = badgeTitleParts.join('\n');
  const isDeleted = showAnnotations && status === 'deleted';
  const shouldGhost = isGhosted || isDeleted;

  // Reset thumbnail state when showThumbnails is toggled on
  useEffect(() => {
    if (showThumbnails) {
      setThumbError(false);
      setThumbLoading(canRequestThumbnail && !node.thumbnailUrl);
      if (canRequestThumbnail) {
        setThumbKey(k => k + 1); // Force new image request
      }
    }
  }, [showThumbnails, node.thumbnailUrl, node.url, canRequestThumbnail, thumbnailSessionId]);

  useEffect(() => {
    if (!showThumbnails) return;
    if (!canRequestThumbnail) return;
    if (!thumbnailReloadKey) return;
    setThumbError(false);
    setThumbLoading(true);
    setThumbKey(k => k + 1);
  }, [thumbnailReloadKey, showThumbnails, canRequestThumbnail]);

  useEffect(() => {
    if (!thumbnailCaptureStopped) return;
    if (thumbLoading) {
      const loadedImage = thumbImgRef.current?.complete && thumbImgRef.current?.naturalWidth > 0;
      setThumbLoading(false);
      if (!loadedImage) {
        setThumbError(true);
      }
    }
  }, [thumbnailCaptureStopped, thumbLoading]);

  // Timeout fallback - screenshots can be slow on large scans
  useEffect(() => {
    if (!showThumbnails) return undefined;
    if (!canRequestThumbnail) return undefined;
    const timeout = setTimeout(() => {
      if (thumbLoading) {
        setThumbError(true);
        setThumbLoading(false);
        onThumbnailError?.(node.id, node.url);
      }
    }, 120000);
    return () => clearTimeout(timeout);
  }, [showThumbnails, thumbLoading, thumbKey, thumb, canRequestThumbnail, node.id, node.url, onThumbnailError]);

  useEffect(() => {
    if (!showThumbnails || !onRequestThumbnail) return;
    if (!canRequestThumbnail) return;
    if (node.thumbnailUrl && isScreenshotThumb) return;
    if (thumbError) return;
    let isActive = true;
    setThumbLoading(!node.thumbnailUrl);
    setThumbError(false);
    onRequestThumbnail(node).then((success) => {
      if (!isActive) return;
      if (success === false && !node.thumbnailUrl) {
        setThumbError(true);
        setThumbLoading(false);
      }
    });
    return () => {
      isActive = false;
    };
  }, [showThumbnails, node.thumbnailUrl, node.url, onRequestThumbnail, isScreenshotThumb, thumbError, canRequestThumbnail]);

  useEffect(() => {
    if (!thumb || !thumbImgRef.current) return;
    if (thumbImgRef.current.complete && thumbImgRef.current.naturalWidth > 0) {
      setThumbError(false);
      setThumbLoading(false);
      onThumbnailLoad?.(node.id);
    }
  }, [thumb, node.id, onThumbnailLoad]);

  const handleViewFull = () => {
    // Use uploaded thumbnail if available, otherwise use URL for mshots
    onViewImage(node.thumbnailUrl || node.url, !!node.thumbnailUrl, node.id);
    if (!node.thumbnailUrl && thumbError) {
      setThumbError(false);
      setThumbLoading(true);
      setThumbKey(k => k + 1);
    }
  };

  const classNames = ['node-card'];
  if (isDragging) classNames.push('dragging');
  if (isPressing) classNames.push('pressing');
  if (showThumbnails) classNames.push('with-thumb');
  if (connectionTool === 'userflow') classNames.push('connection-mode-userflow');
  if (connectionTool === 'crosslink') classNames.push('connection-mode-crosslink');
  if (stackInfo?.collapsed) classNames.push('stack-collapsed');
  if (stackInfo?.showCollapse) classNames.push('stack-expanded');
  if (stackInfo?.collapsed || stackInfo?.showCollapse) classNames.push('has-stack-toggle');
  if (shouldGhost) classNames.push('ghosted');
  if (isDeleted) classNames.push('deleted');
  if (isSelected) classNames.push('selected');

  // Anchor color based on connection tool type
  const anchorColor = connectionTool === 'userflow' ? '#14b8a6' : '#f97316';
  const showStackToggle = stackInfo?.collapsed || stackInfo?.showCollapse;
  const stackToggleLabel = stackInfo?.collapsed
    ? `+${Math.max(0, (stackInfo.totalCount || 0) - 1)} more`
    : 'Collapse';

  return (
    <div
      className={classNames.join(' ')}
      data-node-card="1"
      data-node-id={node.id}
      style={{ cursor: isRoot ? 'default' : (connectionTool ? 'default' : 'grab') }}
      {...(isRoot ? {} : dragHandleProps)}
    >
      {/* Connection anchor points - show when connection tool is active */}
      {connectionTool && (
        <>
          <div
            className={`anchor-point anchor-top ${snapTarget?.nodeId === node.id && snapTarget?.anchor === 'top' ? 'snapped' : ''}`}
            style={{ backgroundColor: anchorColor, width: '12px', height: '12px', minWidth: '12px', minHeight: '12px' }}
            onMouseDown={(e) => { e.stopPropagation(); onAnchorMouseDown?.(node.id, 'top', e); }}
            data-anchor="top"
          />
          <div
            className={`anchor-point anchor-right ${snapTarget?.nodeId === node.id && snapTarget?.anchor === 'right' ? 'snapped' : ''}`}
            style={{ backgroundColor: anchorColor, width: '12px', height: '12px', minWidth: '12px', minHeight: '12px' }}
            onMouseDown={(e) => { e.stopPropagation(); onAnchorMouseDown?.(node.id, 'right', e); }}
            data-anchor="right"
          />
          <div
            className={`anchor-point anchor-bottom ${snapTarget?.nodeId === node.id && snapTarget?.anchor === 'bottom' ? 'snapped' : ''}`}
            style={{ backgroundColor: anchorColor, width: '12px', height: '12px', minWidth: '12px', minHeight: '12px' }}
            onMouseDown={(e) => { e.stopPropagation(); onAnchorMouseDown?.(node.id, 'bottom', e); }}
            data-anchor="bottom"
          />
          <div
            className={`anchor-point anchor-left ${snapTarget?.nodeId === node.id && snapTarget?.anchor === 'left' ? 'snapped' : ''}`}
            style={{ backgroundColor: anchorColor, width: '12px', height: '12px', minWidth: '12px', minHeight: '12px' }}
            onMouseDown={(e) => { e.stopPropagation(); onAnchorMouseDown?.(node.id, 'left', e); }}
            data-anchor="left"
          />
        </>
      )}

      <div
        className="card-header"
        style={{ backgroundColor: color }}
      >
      </div>

      {/* Comment badge - show if node has comments and comments mode is active */}
      {showCommentBadges && node.comments?.length > 0 && (
        <button
          className="comment-badge"
          onClick={(e) => { e.stopPropagation(); onViewNotes?.(node); }}
          title="View notes"
        >
          <MessageSquare size={12} />
          {node.comments.length > 1 && <span>{node.comments.length}</span>}
        </button>
      )}

      {showThumbnails && (
        <div className="card-thumb">
          {thumbLoading && !thumbError && (
            <div className="thumb-loading">
              <Loader2 size={24} className="thumb-spinner" />
            </div>
          )}
          {hasThumb && !thumbError ? (
            <>
              <img
                className="thumb-img"
                src={thumb}
                alt={node.title}
                loading="lazy"
                ref={thumbImgRef}
                onLoad={() => {
                  setThumbError(false);
                  setThumbLoading(false);
                  onThumbnailLoad?.(node.id);
                }}
                onError={() => {
                  setThumbError(true);
                  setThumbLoading(false);
                  onThumbnailError?.(node.id, node.url);
                }}
                style={{ opacity: thumbLoading ? 0 : 1 }}
              />
              {!thumbLoading && (
                <button
                  className="thumb-fullsize-btn"
                  onClick={handleViewFull}
                  title="View full size"
                >
                  <Maximize2 size={14} />
                </button>
              )}
            </>
          ) : (
            <div className="thumb-placeholder">
              <ImageOff size={32} strokeWidth={1.5} />
              <span className="thumb-placeholder-domain">{getHostname(node.url)}</span>
              <span className="thumb-placeholder-text">
                {thumbLoading ? 'Generating preview' : 'Preview unavailable'}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="card-content">
        <div className="card-content-top">
          <div className="card-title" title={node.title}>
            {node.title}
          </div>
          {showBadge && (
            <div
              className={`node-status-badge ${hasStatus ? `status-${status}` : 'status-note'}`}
              title={badgeTitle}
              aria-hidden="true"
            >
              <span className="node-status-text">{badgeLabel}</span>
              {note && <span className="node-status-note-dot" />}
            </div>
          )}
        </div>

        {showPageNumbers && <span className="page-number">{number}</span>}
      </div>

      <div className="card-actions">
        <div className="card-actions-left">
          {canEdit && (
            <button className="btn-icon-flat" title="Edit" onClick={() => onEdit(node)}>
              <Edit2 size={18} />
            </button>
          )}
          {canEdit && !isRoot && (
            <button className="btn-icon-flat danger" title="Delete" onClick={() => onDelete(node.id)}>
              <Trash2 size={18} />
            </button>
          )}
          {canEdit && (
            <button className="btn-icon-flat" title="Duplicate" onClick={() => onDuplicate(node)}>
              <Copy size={18} />
            </button>
          )}
          {canComment && (
            <button className="btn-icon-flat" title="Add Note" onClick={() => onAddNote?.(node)}>
              <MessageSquare size={18} />
            </button>
          )}
        </div>
        {node.url && (
          <a
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-icon-flat external-link-btn"
            title="Open in new tab"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={18} />
          </a>
        )}
      </div>

      {showStackToggle && (
        <button
          className={`stack-toggle ${stackInfo?.collapsed ? 'collapsed' : 'expanded'}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleStack?.();
          }}
          onMouseDown={(event) => event.stopPropagation()}
          type="button"
          title={stackInfo?.collapsed ? 'Expand stack' : 'Collapse stack'}
        >
          <span>{stackToggleLabel}</span>
          {stackInfo?.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      )}

      {badges.length > 0 && (
        <div className="node-badges" aria-hidden="true">
          {badges.map((badge) => (
            <span key={badge} className="node-badge">
              {badge}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// Wrapper component that makes NodeCard draggable using dnd-kit
const DraggableNodeCard = ({
  node,
  number,
  color,
  showThumbnails,
  showCommentBadges,
  canEdit,
  canComment,
  connectionTool,
  snapTarget,
  onAnchorMouseDown,
  onDelete,
  onEdit,
  onDuplicate,
  onViewImage,
  onAddNote,
  onViewNotes,
  isRoot,
  activeId,
  badges,
  showPageNumbers,
  onRequestThumbnail,
  thumbnailRequestIds,
  thumbnailSessionId,
  thumbnailReloadKey,
  thumbnailCaptureStopped,
  onThumbnailLoad,
  onThumbnailError,
  showAnnotations,
  stackInfo,
  onToggleStack,
  isGhosted,
  isSelected,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: node.id,
    data: { node, number, color },
    disabled: node.id === 'root' || !canEdit || connectionTool, // Disable dragging when connection tool active
  });

  return (
    <div ref={setNodeRef}>
      <NodeCard
        node={node}
        number={number}
        color={color}
        showThumbnails={showThumbnails}
        showCommentBadges={showCommentBadges}
        canEdit={canEdit}
        canComment={canComment}
        connectionTool={connectionTool}
        snapTarget={snapTarget}
        onAnchorMouseDown={onAnchorMouseDown}
        onDelete={onDelete}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onViewImage={onViewImage}
        onAddNote={onAddNote}
        onViewNotes={onViewNotes}
        isRoot={isRoot}
        isDragging={isDragging || activeId === node.id}
        dragHandleProps={canEdit && !connectionTool ? { ...listeners, ...attributes } : {}}
        badges={badges}
        showPageNumbers={showPageNumbers}
        showAnnotations={showAnnotations}
        onRequestThumbnail={onRequestThumbnail}
        thumbnailRequestIds={thumbnailRequestIds}
        thumbnailSessionId={thumbnailSessionId}
        thumbnailReloadKey={thumbnailReloadKey}
        thumbnailCaptureStopped={thumbnailCaptureStopped}
        onThumbnailLoad={onThumbnailLoad}
        onThumbnailError={onThumbnailError}
        stackInfo={stackInfo}
        onToggleStack={onToggleStack}
        isGhosted={isGhosted}
        isSelected={isSelected}
      />
    </div>
  );
};

// Component for rendering a node and its children in the DragOverlay
const DragOverlayTree = ({
  node,
  number,
  color,
  colors,
  showThumbnails,
  depth,
  badges,
  showPageNumbers = true,
  showAnnotations = true,
}) => {
  const childColor = colors[Math.min(depth + 1, colors.length - 1)];
  const INDENT = 40;
  const GAP = 60;

  return (
    <div className="drag-overlay-tree">
      <NodeCard
        node={node}
        number={number}
        color={color}
        showThumbnails={showThumbnails}
        showAnnotations={showAnnotations}
        isRoot={false}
        isDragging={true}
        onDelete={() => {}}
        onEdit={() => {}}
        onDuplicate={() => {}}
        onViewImage={() => {}}
        badges={badges}
        showPageNumbers={showPageNumbers}
      />
      {node.children?.length > 0 && (
        <div
          className="drag-overlay-children"
          style={{
            marginTop: GAP,
            marginLeft: INDENT,
          }}
        >
          {node.children.map((child, idx) => (
            <div key={child.id} style={{ marginTop: idx > 0 ? GAP : 0 }}>
              <DragOverlayTree
                node={child}
                number={`${number}.${idx + 1}`}
                color={childColor}
                colors={colors}
                showThumbnails={showThumbnails}
                depth={depth + 1}
                badges={badges}
                showPageNumbers={showPageNumbers}
                showAnnotations={showAnnotations}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export { NodeCard, DraggableNodeCard, DragOverlayTree };
