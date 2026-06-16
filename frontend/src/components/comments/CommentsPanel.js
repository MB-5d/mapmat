import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';
import CheckboxField from '../ui/CheckboxField';
import IconButton from '../ui/IconButton';
import SearchInput from '../ui/SearchInput';

const sameCommentId = (a, b) => String(a ?? '') === String(b ?? '');

const CommentsPanel = ({
  isOpen,
  root,
  orphans,
  selectedCommentId,
  onClose,
  onCommentClick,
  onDeleteComment,
  onNavigateToNode,
}) => {
  const [filter, setFilter] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);

  // Collect all comments from tree and orphans
  const getAllComments = () => {
    const comments = [];

    const collectFromNode = (node) => {
      if (node.comments?.length > 0) {
        node.comments.forEach(comment => {
          comments.push({
            ...comment,
            nodeId: node.id,
            nodeTitle: node.title || 'Untitled',
          });
        });
      }
      (node.children || []).forEach(child => collectFromNode(child));
    };

    if (root) collectFromNode(root);
    orphans.forEach(orphan => collectFromNode(orphan));

    // Sort by most recent first
    return comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const allComments = getAllComments();
  const navigateToComment = (comment) => {
    if (onCommentClick) {
      onCommentClick(comment.nodeId, comment.id);
      return;
    }
    onNavigateToNode?.(comment.nodeId);
  };

  const filteredComments = allComments.filter(comment => {
    // Filter by completed status
    if (!showCompleted && comment.completed) return false;

    if (!filter) return true;
    const searchLower = filter.toLowerCase();

    return (
      comment.text.toLowerCase().includes(searchLower) ||
      comment.author.toLowerCase().includes(searchLower) ||
      comment.nodeTitle.toLowerCase().includes(searchLower)
    );
  });

  return (
    <AccountDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Comments"
      className="comments-drawer"
      data-feedback-id="comments-panel"
      data-feedback-label="Comments panel"
    >
      <div className="comments-panel-filter">
        <div className="comments-filter-row">
          <SearchInput
            placeholder="Search comments"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onClear={() => setFilter('')}
            className="comments-filter-input"
          />
        </div>
        <CheckboxField
          className="comments-filter-toggle"
          checked={showCompleted}
          onChange={(e) => setShowCompleted(e.target.checked)}
          label="Show completed"
        />
      </div>

      <div className="comments-panel-body">
        {filteredComments.length > 0 ? (
          <div className="comments-panel-list">
            {filteredComments.map(comment => {
              const isSelected = sameCommentId(selectedCommentId, comment.id);
              return (
              <div
                key={comment.id}
                className={`comments-panel-item${isSelected ? ' is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => navigateToComment(comment)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigateToComment(comment);
                  }
                }}
              >
                <div className="comments-panel-item-header">
                  <span className="comments-panel-node-title">{comment.nodeTitle}</span>
                  {onDeleteComment ? (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      className="comments-panel-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteComment(comment.nodeId, comment.id);
                      }}
                      aria-label="Delete comment"
                    >
                      <Trash2 />
                    </IconButton>
                  ) : null}
                </div>
                <div className="comments-panel-text">{comment.text}</div>
                <div className="comments-panel-item-meta">
                  <span className="comments-panel-author">{comment.author}</span>
                  <span className="comments-panel-time">{formatTimeAgo(comment.createdAt)}</span>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="comments-panel-empty">
            {filter ? 'No matching comments' : 'No comments yet'}
          </div>
        )}
      </div>
    </AccountDrawer>
  );
};

export default CommentsPanel;
