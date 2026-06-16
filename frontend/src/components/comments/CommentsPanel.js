import React, { useState } from 'react';

import AccountDrawer from '../drawers/AccountDrawer';
import CheckboxField from '../ui/CheckboxField';
import SelectInput from '../ui/SelectInput';
import TextInput from '../ui/TextInput';

const sameCommentId = (a, b) => String(a ?? '') === String(b ?? '');

const CommentsPanel = ({
  isOpen,
  root,
  orphans,
  selectedCommentId,
  onClose,
  onCommentClick,
  onNavigateToNode,
}) => {
  const [filter, setFilter] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'author', 'mention'
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

  const filteredComments = allComments.filter(comment => {
    // Filter by completed status
    if (!showCompleted && comment.completed) return false;

    if (!filter) return true;
    const searchLower = filter.toLowerCase();

    if (filterType === 'author') {
      return comment.author.toLowerCase().includes(searchLower);
    }
    if (filterType === 'mention') {
      return comment.mentions?.some(m => m.toLowerCase().includes(searchLower));
    }
    // 'all' - search text, author, and node title
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
      title="All Comments"
      className="comments-drawer"
      data-feedback-id="comments-panel"
      data-feedback-label="Comments panel"
    >
      <div className="comments-panel-filter">
        <div className="comments-filter-row">
          <TextInput
            type="text"
            placeholder="Filter comments..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="comments-filter-input"
          />
          <SelectInput
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="comments-filter-select"
          >
            <option value="all">All</option>
            <option value="author">By Author</option>
            <option value="mention">By Mention</option>
          </SelectInput>
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
              <button
                type="button"
                key={comment.id}
                className={`comments-panel-item${isSelected ? ' is-selected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => {
                  if (onCommentClick) {
                    onCommentClick(comment.nodeId, comment.id);
                    return;
                  }
                  onNavigateToNode?.(comment.nodeId);
                }}
              >
                <div className="comments-panel-item-header">
                  <span className="comments-panel-node-title">{comment.nodeTitle}</span>
                </div>
                <div className="comments-panel-item-meta">
                  <span className="comments-panel-author">{comment.author}</span>
                  <span className="comments-panel-time">{formatTimeAgo(comment.createdAt)}</span>
                </div>
                <div className="comments-panel-text">{comment.text}</div>
              </button>
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
