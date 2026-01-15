import React, { useEffect, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  Copy,
  Edit2,
  ExternalLink,
  Globe,
  Loader2,
  Maximize2,
  MessageSquare,
  Trash2,
} from 'lucide-react';

import { getHostname } from '../../utils/url';

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
  onRequestThumbnail,
}) => {
  const [thumbError, setThumbError] = useState(false);
  const [thumbLoading, setThumbLoading] = useState(true);
  const [thumbKey, setThumbKey] = useState(0);
  const [thumbRetries, setThumbRetries] = useState(0);
  const [requestRetries, setRequestRetries] = useState(0);

  const thumb = node.thumbnailUrl
    ? `${node.thumbnailUrl}${node.thumbnailUrl.includes('?') ? '&' : '?'}_=${thumbKey}`
    : null;
  const hasThumb = Boolean(thumb);

  // Reset thumbnail state when showThumbnails is toggled on
  useEffect(() => {
    if (showThumbnails) {
      setThumbError(false);
      setThumbLoading(Boolean(thumb));
      setThumbKey(k => k + 1); // Force new image request
      setThumbRetries(0);
      setRequestRetries(0);
    }
  }, [showThumbnails, node.thumbnailUrl, node.url]);

  // Timeout fallback - if thumbnail doesn't load in 15 seconds, show placeholder
  useEffect(() => {
    if (!showThumbnails) return undefined;
    const timeout = setTimeout(() => {
      if (thumbLoading) {
        setThumbError(true);
        setThumbLoading(false);
      }
    }, 15000);
    return () => clearTimeout(timeout);
  }, [showThumbnails, thumbLoading, thumbKey, thumb]);

  useEffect(() => {
    if (!showThumbnails || !thumb || !thumbError) return undefined;
    if (thumbRetries >= 2) return undefined;
    const retry = setTimeout(() => {
      setThumbRetries((prev) => prev + 1);
      setThumbError(false);
      setThumbLoading(true);
      setThumbKey(k => k + 1);
    }, 4000);
    return () => clearTimeout(retry);
  }, [showThumbnails, node.thumbnailUrl, thumbError, thumbRetries]);

  useEffect(() => {
    if (!showThumbnails || node.thumbnailUrl || !onRequestThumbnail) return undefined;
    if (!thumbError) return undefined;
    if (requestRetries >= 2) return undefined;
    const retry = setTimeout(() => {
      setRequestRetries(prev => prev + 1);
      setThumbError(false);
      setThumbLoading(true);
      onRequestThumbnail(node);
    }, 3000);
    return () => clearTimeout(retry);
  }, [showThumbnails, node.thumbnailUrl, thumbError, requestRetries, onRequestThumbnail, node]);

  useEffect(() => {
    if (!showThumbnails || node.thumbnailUrl || node.authRequired || !onRequestThumbnail) return;
    setThumbLoading(true);
    setThumbError(false);
    onRequestThumbnail(node);
  }, [showThumbnails, node.thumbnailUrl, node.url, node.authRequired, onRequestThumbnail]);

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

  // Anchor color based on connection tool type
  const anchorColor = connectionTool === 'userflow' ? '#14b8a6' : '#f97316';

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
          {hasThumb ? (
            <>
              <img
                className="thumb-img"
                src={thumb}
                alt={node.title}
                loading="lazy"
                onLoad={() => setThumbLoading(false)}
                onError={() => { setThumbError(true); setThumbLoading(false); }}
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
              <Globe size={32} strokeWidth={1.5} />
              <span className="thumb-placeholder-domain">{getHostname(node.url)}</span>
              <span className="thumb-placeholder-text">
                {thumbLoading ? 'Generating preview' : 'Preview unavailable'}
              </span>
              <button
                className="thumb-fullsize-btn thumb-fullsize-placeholder"
                onClick={handleViewFull}
                title="View full size"
                type="button"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card-content">
        <div className="card-title" title={node.title}>
          {node.title}
        </div>

        {showPageNumbers && <span className="page-number">{number}</span>}
      </div>

      <div className="card-actions">
        <div className="card-actions-left">
          {canEdit && (
            <button className="btn-icon-flat" title="Edit" onClick={() => onEdit(node)}>
              <Edit2 size={16} />
            </button>
          )}
          {canEdit && !isRoot && (
            <button className="btn-icon-flat danger" title="Delete" onClick={() => onDelete(node.id)}>
              <Trash2 size={16} />
            </button>
          )}
          {canEdit && (
            <button className="btn-icon-flat" title="Duplicate" onClick={() => onDuplicate(node)}>
              <Copy size={16} />
            </button>
          )}
          {canComment && (
            <button className="btn-icon-flat" title="Add Note" onClick={() => onAddNote?.(node)}>
              <MessageSquare size={16} />
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
            <ExternalLink size={16} />
          </a>
        )}
      </div>

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
        onRequestThumbnail={onRequestThumbnail}
      />
    </div>
  );
};

// Component for rendering a node and its children in the DragOverlay
const DragOverlayTree = ({ node, number, color, colors, showThumbnails, depth, badges, showPageNumbers = true }) => {
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
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export { NodeCard, DraggableNodeCard, DragOverlayTree };
