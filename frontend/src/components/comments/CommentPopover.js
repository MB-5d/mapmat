import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  X,
} from 'lucide-react';

import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import TextareaInput from '../ui/TextareaInput';

const sameCommentId = (a, b) => String(a ?? '') === String(b ?? '');

const MessageSquareReplyIcon = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="m10 11-3-3 3-3" />
    <path d="M16 14v-2a4 4 0 0 0-4-4H7" />
  </svg>
);

const CommentPopover = ({
  node,
  onClose,
  onAddComment,
  onToggleCompleted,
  collaborators,
  canComment,
  readOnlyMessage = '',
  activeCommentId = null,
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

  const filteredCollaborators = collaborators.filter(c =>
    c.toLowerCase().includes(mentionFilter)
  );

  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  const renderCommentInput = (placeholder) => (
    <div className="comment-input-wrapper">
      <TextareaInput
        ref={inputRef}
        className="comment-input"
        placeholder={placeholder}
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
              type="button"
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
  );

  // Recursive component to render a comment and its replies
  const CommentItem = ({ comment, depth = 0 }) => {
    const isReplyTarget = sameCommentId(replyingTo, comment.id);

    return (
      <div
        className={`comment-item ${comment.completed ? 'completed' : ''}${sameCommentId(activeCommentId, comment.id) ? ' is-active' : ''}${isReplyTarget ? ' is-replying' : ''}`}
        style={{ marginLeft: depth * 16 }}
      >
        <IconButton
          size="xs"
          variant="ghost"
          className={`comment-complete-btn ${comment.completed ? 'checked' : ''}`}
          onClick={() => onToggleCompleted(node.id, comment.id)}
          aria-label={comment.completed ? 'Mark comment as incomplete' : 'Mark comment as complete'}
        >
          <CheckCircle2 />
        </IconButton>
        <div className="comment-content">
          <div className="comment-text">{comment.text}</div>
          <div className="comment-meta">
            <span className="comment-author">{comment.author}</span>
            <span className="comment-time">{formatTimeAgo(comment.createdAt)}</span>
          </div>
          {comment.completed && comment.completedBy && (
            <div className="comment-completed-info">
              <Check size={12} />
              <span>Completed by {comment.completedBy} · {formatTimeAgo(comment.completedAt)}</span>
            </div>
          )}
        </div>
        {canComment && (
          <IconButton
            size="xs"
            variant="ghost"
            className="comment-reply-btn"
            onClick={() => setReplyingTo(comment.id)}
            aria-label="Reply to comment"
          >
            <MessageSquareReplyIcon />
          </IconButton>
        )}
        {isReplyTarget && (
          <div className="comment-reply-composer">
            {renderCommentInput('Write a reply...')}
          </div>
        )}
        {comment.replies?.length > 0 && (
          <div className="comment-replies">
            {comment.replies.map(reply => (
              <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="comment-popover modal-card" role="dialog" aria-label={`Comments on ${node.title || 'Untitled'}`} onWheel={(e) => e.stopPropagation()}>
      <div className="comment-popover-header modal-header">
        <h3>Comments on "{node.title || 'Untitled'}"</h3>
        <IconButton className="comment-popover-close" size="sm" variant="ghost" onClick={handleCancel} aria-label="Close comments">
          <X size={18} />
        </IconButton>
      </div>

      <div className="comment-popover-body modal-body">
        {/* Show existing comments if any */}
        {node.comments?.length > 0 && (
          <div className="comment-list">
            {node.comments.map(comment => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </div>
        )}

        {!canComment && readOnlyMessage && (
          <div className="comment-readonly-note">{readOnlyMessage}</div>
        )}

        {/* Main textarea area - only show if user can comment */}
        {canComment && !replyingTo && (
          <div className="comment-input-section">
            {renderCommentInput("Add a comment...\n(use @ to mention)")}
          </div>
        )}
      </div>

      <div className="comment-popover-footer modal-footer">
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
