import React from 'react';
import { Copy, Edit2, ExternalLink, MessageSquare, Trash2 } from 'lucide-react';

import classNames from '../../utils/classNames';
import Icon from '../ui/Icon';
import IconButton from '../ui/IconButton';

const NodeActionBar = ({
  node,
  permission,
  canEdit = false,
  isRoot = false,
  showCommentAction = false,
  commentActionLabel = 'Comments',
  showExternalLinkAction = true,
  onDelete,
  onEdit,
  onDuplicate,
  onAddNote,
  className,
}) => {
  const fallbackPermission = canEdit
    ? 'Owner / Editor'
    : showCommentAction
      ? 'Commenter'
      : 'Viewer';
  const resolvedPermission = permission || fallbackPermission;
  const hasLink = showExternalLinkAction && !!node?.url;
  const showOwnerEditorActions = resolvedPermission === 'Owner / Editor';
  const showCommenterAction = resolvedPermission === 'Commenter';
  const hasActions = showOwnerEditorActions || showCommenterAction || hasLink;

  if (!hasActions) return null;

  return (
    <div className={classNames('node-action-bar', className)}>
      <div className="node-action-bar__left">
        {showOwnerEditorActions ? (
          <IconButton
            className="node-card-action"
            type="link"
            buttonStyle="mono"
            size="md"
            icon={<Edit2 />}
            label="Edit"
            title="Edit"
            onClick={() => onEdit?.(node)}
          />
        ) : null}
        {showOwnerEditorActions && !isRoot ? (
          <IconButton
            className="node-card-action"
            type="link"
            buttonStyle="mono"
            size="md"
            icon={<Trash2 />}
            label="Delete"
            title="Delete"
            onClick={() => onDelete?.(node?.id)}
          />
        ) : null}
        {showOwnerEditorActions ? (
          <IconButton
            className="node-card-action"
            type="link"
            buttonStyle="mono"
            size="md"
            icon={<Copy />}
            label="Duplicate"
            title="Duplicate"
            onClick={() => onDuplicate?.(node)}
          />
        ) : null}
        {(showOwnerEditorActions || showCommenterAction) && showCommentAction ? (
          <IconButton
            className="node-card-action"
            type="link"
            buttonStyle="mono"
            size="md"
            icon={<MessageSquare />}
            label={commentActionLabel}
            title={commentActionLabel}
            onClick={() => onAddNote?.(node)}
          />
        ) : null}
      </div>
      {hasLink ? (
        <a
          href={node.url}
          target="_blank"
          rel="noopener noreferrer"
          className="node-card-link-action"
          title="Open in new tab"
          onClick={(event) => event.stopPropagation()}
        >
          <Icon icon={<ExternalLink />} size={24} />
        </a>
      ) : null}
    </div>
  );
};

export default NodeActionBar;
