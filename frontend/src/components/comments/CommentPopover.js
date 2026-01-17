import React, { useRef, useState } from 'react';
import {
  Check,
  CheckSquare,
  CornerDownRight,
  Square,
  Trash2,
  X,
} from 'lucide-react';

import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import TextareaInput from '../ui/TextareaInput';

const CommentPopover = ({
  node,
  onClose,
  onAddComment,
  onToggleCompleted,
  onDeleteComment,
  collaborators,
  canComment,
}) => {
  const [newComment, setNewComment] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const inputRef = useRef(null);

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

  const handleInputChange = (e) => {
    const value = e.target.value;
    setNewComment(value);

    // Check for @ mention trigger
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(' ')) {
        setShowMentions(true);
        setMentionFilter(textAfterAt.toLowerCase());
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (name) => {
    const lastAtIndex = newComment.lastIndexOf('@');
    const newValue = newComment.slice(0, lastAtIndex) + '@' + name + ' ';
    setNewComment(newValue);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleSubmit = () => {
    if (newComment.trim()) {
      onAddComment(node.id, newComment, replyingTo);
      setNewComment('');
      setReplyingTo(null);
      onClose();
    }
  };

  const handleCancel = () => {
    setNewComment('');
    setReplyingTo(null);
    onClose();
  };

  // Recursive component to render a comment and its replies
  const CommentItem = ({ comment, depth = 0 }) => (
    <div className={`comment-item ${comment.completed ? 'completed' : ''}`} style={{ marginLeft: depth * 16 }}>
      <div className="comment-header">
        <button
          className={`comment-checkbox ${comment.completed ? 'checked' : ''}`}
          onClick={() => onToggleCompleted(node.id, comment.id)}
          title={comment.completed ? 'Mark as incomplete' : 'Mark as complete'}
        >
          {comment.completed ? <CheckSquare size={16} /> : <Square size={16} />}
        </button>
        <div className="comment-meta">
          <span className="comment-author">{comment.author}</span>
          <span className="comment-time">{formatTimeAgo(comment.createdAt)}</span>
        </div>
        {canComment && (
          <div className="comment-actions">
            <button
              className="comment-action-btn"
              onClick={() => {
                setReplyingTo(comment.id);
                inputRef.current?.focus();
              }}
              title="Reply"
            >
              <CornerDownRight size={14} />
            </button>
            <button
              className="comment-action-btn delete"
              onClick={() => onDeleteComment(node.id, comment.id)}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="comment-body">
        <div className="comment-text">{comment.text}</div>
        {comment.completed && comment.completedBy && (
          <div className="comment-completed-info">
            <Check size={12} />
            <span>Completed by {comment.completedBy} · {formatTimeAgo(comment.completedAt)}</span>
          </div>
        )}
      </div>
      {comment.replies?.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map(reply => (
            <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );

  const filteredCollaborators = collaborators.filter(c =>
    c.toLowerCase().includes(mentionFilter)
  );

  return (
    <div className="comment-popover">
      <div className="comment-popover-header">
        <h3>Comments on "{node.title || 'Untitled'}"</h3>
        <IconButton className="comment-popover-close" onClick={handleCancel} aria-label="Close comments">
          <X size={18} />
        </IconButton>
      </div>

      <div className="comment-popover-body">
        {/* Show existing comments if any */}
        {node.comments?.length > 0 && (
          <div className="comment-list">
            {node.comments.map(comment => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </div>
        )}

        {/* Main textarea area - only show if user can comment */}
        {canComment && (
          <div className="comment-input-section">
            {replyingTo && (
              <div className="replying-to-banner">
                <span>Replying to comment</span>
                <button onClick={() => setReplyingTo(null)}>
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="comment-input-wrapper">
              <TextareaInput
                ref={inputRef}
                className="comment-input"
                placeholder={replyingTo ? "Write a reply..." : "Add a comment...\n(use @ to mention)"}
                value={newComment}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && e.metaKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                  if (e.key === 'Escape') {
                    if (replyingTo) {
                      setReplyingTo(null);
                    } else if (showMentions) {
                      setShowMentions(false);
                    } else {
                      handleCancel();
                    }
                  }
                }}
              />
              {showMentions && filteredCollaborators.length > 0 && (
                <div className="mention-dropdown">
                  {filteredCollaborators.map(name => (
                    <button
                      key={name}
                      className="mention-option"
                      onClick={() => insertMention(name)}
                    >
                      @{name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="comment-popover-footer">
        <Button variant="secondary" size="md" onClick={handleCancel}>
          {canComment ? 'Cancel' : 'Close'}
        </Button>
        {canComment && (
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={!newComment.trim()}
          >
            Save
          </Button>
        )}
      </div>
    </div>
  );
};

export default CommentPopover;
