import React, { useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  ImageOff,
  Loader2,
  Lock,
  Maximize2,
} from 'lucide-react';
import CommentBadge from './CommentBadge';
import NodeActionBar from './NodeActionBar';
import NodeBadge from './NodeBadge';
import Badge from '../ui/Badge';

import { getHostname, getUrlExtension, isRenderableTextUrl } from '../../utils/url';
import { ANNOTATION_STATUS_LABELS, DEFAULT_CONNECTION_COLORS, getDepthColor } from '../../utils/constants';
import { getNodeHttpErrorLabel } from '../../utils/scanStatus';

const NODE_STATUS_BADGE_STYLE = {
  new: 'info',
  to_move: 'warning',
  moved: 'info',
  to_delete: 'error',
  deleted: 'error',
  note: 'neutral',
};

const NodeCard = ({
  node,
  number,
  color,
  showThumbnails,
  showCommentBadges,
  canEdit,
  canComment,
  showCommentAction = false,
  commentActionLabel = 'Comments',
  showExternalLinkAction = true,
  showDeleteAction = true,
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
  const [shouldLoadThumb, setShouldLoadThumb] = useState(false);
  const cardRef = useRef(null);
  const thumbImgRef = useRef(null);

  const thumb = node.thumbnailUrl
    ? (thumbnailReloadKey
      ? `${node.thumbnailUrl}${node.thumbnailUrl.includes('?') ? '&' : '?'}_=${thumbnailReloadKey}`
      : node.thumbnailUrl)
    : null;
  const hasThumb = Boolean(thumb);
  const canRequestThumbnail = !!(thumbnailRequestIds && thumbnailRequestIds.has(node.id));
  const annotations = node?.annotations || {};
  const status = annotations.status || 'none';
  const note = typeof annotations.note === 'string' ? annotations.note.trim() : '';
  const tags = Array.isArray(annotations.tags) ? annotations.tags : [];
  const hasStatus = status !== 'none';
  const showBadge = showAnnotations && hasStatus;
  const statusLabel = ANNOTATION_STATUS_LABELS[status] || status;
  const badgeLabel = statusLabel;
  const badgeTitleParts = [];
  if (hasStatus) badgeTitleParts.push(statusLabel);
  if (note) badgeTitleParts.push(note);
  if (tags.length > 0) badgeTitleParts.push(`Tags: ${tags.join(', ')}`);
  const badgeTitle = badgeTitleParts.join('\n');
  const isDeleted = showAnnotations && status === 'deleted';
  const shouldGhost = isGhosted || isDeleted;
  const showActionBar = canEdit || showCommentAction || (showExternalLinkAction && !!node.url);
  const actionBarPermission = canEdit
    ? 'Owner / Editor'
    : showCommentAction
      ? 'Commenter'
      : 'Viewer';

  const getPreviewIssue = () => {
    const orphanType = String(node?.orphanType || '').toLowerCase();
    const pageType = String(node?.pageType || node?.type || '').toLowerCase();
    const scanStatus = String(node?.scanStatus || node?.status || '').toLowerCase();
    const extension = getUrlExtension(node?.url).toUpperCase();
    const isRenderableText = isRenderableTextUrl(node?.url);
    const isFile = !isRenderableText && (
      node?.isFile
      || orphanType === 'file'
      || pageType === 'file'
      || ['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX', 'ZIP'].includes(extension)
    );
    if (isFile) {
      return {
        icon: FileText,
        label: extension ? `${extension} file` : 'File link',
        text: 'No page preview',
        variant: 'file',
      };
    }
    if (node?.authRequired) {
      return {
        icon: Lock,
        label: 'Requires login',
        text: 'Preview unavailable',
        variant: 'blocked',
      };
    }
    const statusCode = Number(node?.httpStatus ?? node?.statusCode);
    const isViewableError = Boolean(node?.isViewableError && Number.isFinite(statusCode) && statusCode >= 400);
    if (isViewableError) return null;
    if (
      node?.isBroken
      || orphanType === 'broken'
      || scanStatus === 'error'
      || scanStatus === 'failed'
      || (Number.isFinite(statusCode) && statusCode >= 400)
    ) {
      return {
        icon: AlertTriangle,
        label: getNodeHttpErrorLabel(node) || 'Error page',
        text: 'Preview unavailable',
        variant: 'error',
      };
    }
    if (node?.isInactive || orphanType === 'inactive' || scanStatus === 'inactive' || statusCode === 0) {
      return {
        icon: AlertTriangle,
        label: 'Inactive page',
        text: 'Preview unavailable',
        variant: 'inactive',
      };
    }
    if (node?.thumbnailCaptureFailed) {
      return {
        icon: AlertTriangle,
        label: node.thumbnailCaptureError || 'Capture failed',
        text: 'Preview unavailable',
        variant: 'error',
      };
    }
    return null;
  };
  const previewIssue = getPreviewIssue();
  const PlaceholderIcon = previewIssue?.icon || ImageOff;

  // Reset thumbnail state when showThumbnails is toggled on
  useEffect(() => {
    if (showThumbnails) {
      const hasExistingThumbnail = !!node.thumbnailUrl;
      setThumbError(false);
      setThumbLoading(canRequestThumbnail && !hasExistingThumbnail);
      setShouldLoadThumb(hasExistingThumbnail);
    }
  }, [showThumbnails, node.thumbnailUrl, node.url, canRequestThumbnail, thumbnailSessionId]);

  useEffect(() => {
    if (!showThumbnails || !thumb) return undefined;
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldLoadThumb(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoadThumb(true);
        observer.disconnect();
      }
    }, { root: null, rootMargin: '900px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [showThumbnails, thumb]);

  useEffect(() => {
    if (!showThumbnails) return;
    if (!canRequestThumbnail) return;
    if (!thumbnailReloadKey) return;
    setThumbError(false);
    setThumbLoading(true);
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
        if (thumb) {
          onThumbnailError?.(node.id, node.url);
        }
      }
    }, 120000);
    return () => clearTimeout(timeout);
  }, [showThumbnails, thumbLoading, thumb, canRequestThumbnail, node.id, node.url, onThumbnailError]);

  useEffect(() => {
    if (!thumb || !thumbImgRef.current) return;
    if (thumbImgRef.current.complete && thumbImgRef.current.naturalWidth > 0) {
      setThumbError(false);
      setThumbLoading(false);
      onThumbnailLoad?.(node.id);
    }
  }, [thumb, node.id, onThumbnailLoad]);

  const handleViewFull = () => {
    const fallbackAssetUrl = !node.url ? (node.thumbnailFullUrl || node.thumbnailUrl) : '';
    const directAssetUrl = node.fullScreenshotUrl || fallbackAssetUrl;
    const hasDirectImage = !!directAssetUrl;
    const source = directAssetUrl || node.url;
    if (!source) return;
    onViewImage(source, hasDirectImage, node.id, node.fullScreenshotUrl || node.url ? 'full' : 'thumb');
    if (!node.thumbnailUrl && thumbError) {
      setThumbError(false);
      setThumbLoading(true);
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
  if (showActionBar) classNames.push('has-action-bar');
  if (showCommentBadges && node.comments?.length > 0) classNames.push('has-comment-badge');

  // Anchor color based on connection tool type
  const anchorColor = connectionTool === 'userflow'
    ? DEFAULT_CONNECTION_COLORS.userFlows
    : DEFAULT_CONNECTION_COLORS.crossLinks;
  const showStackToggle = stackInfo?.collapsed || stackInfo?.showCollapse;
  const stackToggleLabel = stackInfo?.collapsed
    ? `+${Math.max(0, (stackInfo.totalCount || 0) - 1)} more`
    : 'Collapse';

  return (
    <div
      ref={cardRef}
      className={classNames.join(' ')}
      data-node-card="1"
      data-node-id={node.id}
      data-feedback-id={`node-card-${node.id}`}
      data-feedback-label={node.title || 'Node card'}
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
        <CommentBadge
          count={node.comments.length}
          onClick={(e) => { e.stopPropagation(); onViewNotes?.(node); }}
        />
      )}

      {showThumbnails && (
        <div className="card-thumb">
          {thumbLoading && !thumbError && (
            <div className="thumb-loading">
              <Loader2 size={24} className="thumb-spinner" />
            </div>
          )}
          {hasThumb && shouldLoadThumb && !thumbError ? (
            <>
              <img
                className="thumb-img"
                src={thumb}
                alt={node.title}
                loading={canRequestThumbnail ? 'eager' : 'lazy'}
                decoding="async"
                fetchpriority="low"
                width="288"
                height="152"
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
            <div className={`thumb-placeholder ${previewIssue ? `thumb-placeholder-${previewIssue.variant}` : ''}`}>
              <PlaceholderIcon size={32} strokeWidth={1.5} />
              <span className="thumb-placeholder-domain">{getHostname(node.url)}</span>
              {previewIssue?.label && (
                <span className="thumb-placeholder-label">{previewIssue.label}</span>
              )}
              <span className="thumb-placeholder-text">
                {thumbLoading ? 'Generating preview' : (previewIssue?.text || 'Preview unavailable')}
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
            <Badge
              className={`node-status-badge status-${hasStatus ? status : 'note'}`}
              type="hollow"
              badgeStyle={NODE_STATUS_BADGE_STYLE[hasStatus ? status : 'note'] || 'neutral'}
              size="sm"
              title={badgeTitle}
              aria-hidden="true"
            >
              <span className="node-status-text">{badgeLabel}</span>
              {note ? <span className="node-status-note-dot" /> : null}
            </Badge>
          )}
        </div>

        {showPageNumbers && <span className="page-number">{number}</span>}
      </div>

      {showActionBar && (
        <div className="card-actions">
          <NodeActionBar
            node={node}
            permission={actionBarPermission}
            canEdit={canEdit}
            isRoot={isRoot}
            showCommentAction={showCommentAction}
            commentActionLabel={commentActionLabel}
            showExternalLinkAction={showExternalLinkAction}
            showDeleteAction={showDeleteAction}
            onDelete={onDelete}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onAddNote={onAddNote}
          />
        </div>
      )}

      {showStackToggle && (
        <button
          className={`stack-toggle ${stackInfo?.collapsed ? 'collapsed' : 'expanded'}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleStack?.();
          }}
          onPointerDown={(event) => event.stopPropagation()}
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
            <NodeBadge key={badge} label={badge} />
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
  showCommentAction,
  commentActionLabel,
  showExternalLinkAction,
  showDeleteAction,
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
        showCommentAction={showCommentAction}
        commentActionLabel={commentActionLabel}
        showExternalLinkAction={showExternalLinkAction}
        showDeleteAction={showDeleteAction}
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
  const childColor = getDepthColor(colors, depth + 1);
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
