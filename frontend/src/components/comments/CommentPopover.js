import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  MessageSquarePlus,
  PencilLine,
  Reply,
  Send,
  Trash2,
  X,
} from 'lucide-react';

import classNames from '../../utils/classNames';
import Avatar from '../ui/Avatar';
import IconButton from '../ui/IconButton';
import TextareaInput from '../ui/TextareaInput';

const sameCommentId = (a, b) => String(a ?? '') === String(b ?? '');

const MessageSquareOffIcon = ({ size = 24, color = 'currentColor', ...props }) => (
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
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="m4 4 16 16" />
  </svg>
);

const sortCommentsNewestFirst = (comments = []) => (
  [...comments].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
);

const collectCommentIds = (comments = [], ids = []) => {
  comments.forEach((comment) => {
    if (!comment?.id) return;
    ids.push(comment.id);
    if (comment.replies?.length) {
      collectCommentIds(comment.replies, ids);
    }
  });
  return ids;
};

const flattenComments = (comments = [], list = []) => {
  comments.forEach((comment) => {
    if (!comment?.id) return;
    list.push(comment);
    if (comment.replies?.length) {
      flattenComments(comment.replies, list);
    }
  });
  return list;
};

const getCommentInitial = (comment) => (
  String(comment?.author || '?').trim().slice(0, 1).toUpperCase() || '?'
);

const getCommentTone = (comment) => {
  const source = String(comment?.authorUserId || comment?.authorEmail || comment?.author || comment?.id || '');
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash + source.charCodeAt(i)) % 4;
  }
  return hash;
};

const renderCommentText = (text) => {
  const parts = String(text || '').split(/(@[a-z0-9_.-]+)/gi);
  return parts.map((part, index) => (
    /^@[a-z0-9_.-]+$/i.test(part)
      ? <span key={`${part}-${index}`} className="comment-mention">{part}</span>
      : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
  ));
};

const CommentPopover = ({
  node,
  onClose,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onToggleCompleted,
  onSetCommentsCompleted,
  onDeleteAllComments,
  collaborators = [],
  canComment,
  readOnlyMessage = '',
  activeCommentId = null,
}) => {
  const [newComment, setNewComment] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [editDraft, setEditDraft] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [activeComposer, setActiveComposer] = useState(null);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const newInputRef = useRef(null);
  const replyInputRef = useRef(null);
  const editInputRef = useRef(null);

  const comments = useMemo(
    () => sortCommentsNewestFirst(Array.isArray(node?.comments) ? node.comments : []),
    [node?.comments]
  );
  const allComments = useMemo(() => flattenComments(comments), [comments]);
  const allCommentIds = useMemo(() => allComments.map((comment) => comment.id), [allComments]);
  const allCommentsResolved = allComments.length > 0 && allComments.every((comment) => comment.completed);
  const showNewComposer = canComment && (comments.length === 0 || isAddingComment);

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (!Number.isFinite(seconds)) return '';
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getActiveComposerValue = () => {
    if (activeComposer === 'new') return newComment;
    if (activeComposer === `reply:${replyingTo}`) return replyDraft;
    if (activeComposer === `edit:${editingCommentId}`) return editDraft;
    return '';
  };

  const setActiveComposerValue = (value) => {
    if (activeComposer === 'new') {
      setNewComment(value);
      return;
    }
    if (activeComposer === `reply:${replyingTo}`) {
      setReplyDraft(value);
      return;
    }
    if (activeComposer === `edit:${editingCommentId}`) {
      setEditDraft(value);
    }
  };

  const updateMentionState = (value) => {
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

  const handleInputChange = (composerId, setter) => (event) => {
    const value = event.target.value;
    setActiveComposer(composerId);
    setter(value);
    updateMentionState(value);
  };

  const insertMention = (name) => {
    const currentValue = getActiveComposerValue();
    const lastAtIndex = currentValue.lastIndexOf('@');
    const nextValue = currentValue.slice(0, lastAtIndex) + '@' + name + ' ';
    setActiveComposerValue(nextValue);
    if (activeComposer === 'new') {
      newInputRef.current?.focus();
    } else if (activeComposer === `reply:${replyingTo}`) {
      replyInputRef.current?.focus();
    } else {
      editInputRef.current?.focus();
    }
    setShowMentions(false);
  };

  const filteredCollaborators = (collaborators || []).filter((name) =>
    String(name || '').toLowerCase().includes(mentionFilter)
  );

  useEffect(() => {
    if (showNewComposer) {
      newInputRef.current?.focus();
    }
  }, [showNewComposer]);

  useEffect(() => {
    if (replyingTo) {
      replyInputRef.current?.focus();
    }
  }, [replyingTo]);

  useEffect(() => {
    if (editingCommentId) {
      editInputRef.current?.focus();
    }
  }, [editingCommentId]);

  const resetInlineState = () => {
    setReplyingTo(null);
    setReplyDraft('');
    setEditingCommentId(null);
    setEditDraft('');
    setShowMentions(false);
  };

  const handleClose = () => {
    setNewComment('');
    setIsAddingComment(false);
    resetInlineState();
    onClose();
  };

  const handleAddSubmit = () => {
    if (!newComment.trim()) return;
    onAddComment(node.id, newComment, null);
    setNewComment('');
    setIsAddingComment(false);
    setShowMentions(false);
  };

  const handleReplySubmit = (commentId) => {
    if (!replyDraft.trim()) return;
    onAddComment(node.id, replyDraft, commentId);
    setReplyDraft('');
    setReplyingTo(null);
    setShowMentions(false);
  };

  const handleEditSubmit = (commentId) => {
    if (!editDraft.trim()) return;
    onUpdateComment?.(node.id, commentId, editDraft);
    setEditDraft('');
    setEditingCommentId(null);
    setShowMentions(false);
  };

  const beginReply = (commentId) => {
    setIsAddingComment(false);
    setEditingCommentId(null);
    setEditDraft('');
    setReplyingTo(commentId);
    setReplyDraft('');
    setActiveComposer(`reply:${commentId}`);
    setShowMentions(false);
  };

  const beginEdit = (comment) => {
    setIsAddingComment(false);
    setReplyingTo(null);
    setReplyDraft('');
    setEditingCommentId(comment.id);
    setEditDraft(comment.text || '');
    setActiveComposer(`edit:${comment.id}`);
    setShowMentions(false);
  };

  const handleSetCommentCompleted = (comment) => {
    const ids = collectCommentIds([comment]);
    const completed = !comment.completed;
    if (onSetCommentsCompleted) {
      onSetCommentsCompleted(node.id, ids, completed);
      return;
    }
    onToggleCompleted?.(node.id, comment.id);
  };

  const handleSetAllCompleted = () => {
    if (allCommentIds.length === 0) return;
    onSetCommentsCompleted?.(node.id, allCommentIds, !allCommentsResolved);
  };

  const renderComposer = ({
    className,
    placeholder,
    value,
    composerId,
    inputRef,
    onChange,
    onSubmit,
    onCancel,
  }) => (
    <div className={classNames('comment-input-wrapper', className)}>
      <TextareaInput
        ref={inputRef}
        className="comment-input"
        placeholder={placeholder}
        value={value}
        onFocus={() => setActiveComposer(composerId)}
        onChange={onChange}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && event.metaKey) {
            event.preventDefault();
            onSubmit();
          }
          if (event.key === 'Escape') {
            if (showMentions) {
              setShowMentions(false);
              return;
            }
            onCancel();
          }
        }}
      />
      <div className="comment-input-actions">
        <IconButton
          size="xs"
          type="ghost"
          buttonStyle="brand"
          onClick={onSubmit}
          disabled={!value.trim()}
          aria-label="Send comment"
          title="Send comment"
        >
          <Send />
        </IconButton>
      </div>
      {showMentions && activeComposer === composerId && filteredCollaborators.length > 0 ? (
        <div className="mention-dropdown">
          {filteredCollaborators.map((name) => (
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
      ) : null}
    </div>
  );

  const CommentItem = ({ comment, depth = 0 }) => {
    const isReplyTarget = sameCommentId(replyingTo, comment.id);
    const isEditing = sameCommentId(editingCommentId, comment.id);
    const completedTime = comment.completedAt ? formatTimeAgo(comment.completedAt) : '';

    return (
      <div
        className={classNames(
          'comment-item',
          comment.completed && 'completed',
          sameCommentId(activeCommentId, comment.id) && 'is-active',
          isReplyTarget && 'is-replying',
          isEditing && 'is-editing'
        )}
        style={{ '--comment-depth': depth }}
      >
        <div className="comment-row">
          <Avatar
            className="comment-avatar"
            label={getCommentInitial(comment)}
            size="lg"
            tone={getCommentTone(comment)}
            aria-hidden="true"
          />
          <div className="comment-content">
            <div className="comment-meta">
              <span className="comment-author">{comment.author}</span>
              <span className="comment-time">{formatTimeAgo(comment.createdAt)}</span>
              {canComment ? (
                <div className="comment-actions" aria-label="Comment actions">
                  <IconButton
                    size="xxs"
                    variant="ghost"
                    className="comment-action-btn"
                    onClick={() => beginEdit(comment)}
                    aria-label="Edit comment"
                    title="Edit comment"
                  >
                    <PencilLine />
                  </IconButton>
                  <IconButton
                    size="xxs"
                    variant="ghost"
                    className="comment-action-btn"
                    onClick={() => onDeleteComment?.(node.id, comment.id)}
                    aria-label="Delete comment"
                    title="Delete comment"
                  >
                    <Trash2 />
                  </IconButton>
                  <IconButton
                    size="xxs"
                    variant="ghost"
                    className="comment-action-btn"
                    onClick={() => beginReply(comment.id)}
                    aria-label="Reply to comment"
                    title="Reply to comment"
                  >
                    <Reply />
                  </IconButton>
                  <IconButton
                    size="xxs"
                    variant="ghost"
                    className={classNames('comment-action-btn comment-complete-btn', comment.completed && 'checked')}
                    onClick={() => handleSetCommentCompleted(comment)}
                    aria-label={comment.completed ? 'Mark comment as incomplete' : 'Mark comment as complete'}
                    title={comment.completed ? 'Mark incomplete' : 'Resolve comment'}
                  >
                    <CheckCircle2 />
                  </IconButton>
                </div>
              ) : null}
            </div>
            {isEditing ? (
              renderComposer({
                className: 'comment-edit-composer',
                placeholder: 'Edit comment...',
                value: editDraft,
                composerId: `edit:${comment.id}`,
                inputRef: editInputRef,
                onChange: handleInputChange(`edit:${comment.id}`, setEditDraft),
                onSubmit: () => handleEditSubmit(comment.id),
                onCancel: () => {
                  setEditingCommentId(null);
                  setEditDraft('');
                  setShowMentions(false);
                },
              })
            ) : (
              <div className="comment-text">{renderCommentText(comment.text)}</div>
            )}
            {comment.completed ? (
              <div className="comment-completed-info">
                <span className="comment-completed-label">Resolved -</span>
                {completedTime ? <span>{completedTime}</span> : null}
                {comment.completedBy ? <span>@{comment.completedBy}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
        {isReplyTarget ? (
          <div className="comment-reply-composer">
            {renderComposer({
              placeholder: 'Write a reply...',
              value: replyDraft,
              composerId: `reply:${comment.id}`,
              inputRef: replyInputRef,
              onChange: handleInputChange(`reply:${comment.id}`, setReplyDraft),
              onSubmit: () => handleReplySubmit(comment.id),
              onCancel: () => {
                setReplyingTo(null);
                setReplyDraft('');
                setShowMentions(false);
              },
            })}
          </div>
        ) : null}
        {comment.replies?.length > 0 ? (
          <div className="comment-replies">
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={classNames(
        'comment-popover modal-card',
        canComment && comments.length > 0 && 'has-add-toggle'
      )}
      role="dialog"
      aria-label={`Comments on ${node.title || 'Untitled'}`}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="comment-popover-header modal-header">
        <div className="comment-popover-heading">
          <h3>Comments on "{node.title || 'Untitled'}"</h3>
          {canComment && comments.length > 0 ? (
            <div className="comment-popover-thread-actions" aria-label="Thread actions">
              <IconButton
                size="xs"
                variant="ghost"
                onClick={() => onDeleteAllComments?.(node.id)}
                aria-label="Delete all comments"
                title="Delete all comments"
              >
                <Trash2 />
              </IconButton>
              <IconButton
                size="xs"
                variant="ghost"
                className={classNames('comment-popover-resolve-all', allCommentsResolved && 'checked')}
                onClick={handleSetAllCompleted}
                aria-label={allCommentsResolved ? 'Mark all comments as incomplete' : 'Resolve all comments'}
                title={allCommentsResolved ? 'Mark all incomplete' : 'Resolve all comments'}
              >
                <CheckCircle2 />
              </IconButton>
            </div>
          ) : null}
        </div>
        <IconButton className="comment-popover-close" size="sm" variant="ghost" onClick={handleClose} aria-label="Close comments">
          <X />
        </IconButton>
      </div>

      <div className="comment-popover-body modal-body">
        <div className="comment-thread-scroll">
          {showNewComposer ? (
            <div className="comment-input-section">
              {renderComposer({
                placeholder: "Add a comment...\n(use @ to mention)",
                value: newComment,
                composerId: 'new',
                inputRef: newInputRef,
                onChange: handleInputChange('new', setNewComment),
                onSubmit: handleAddSubmit,
                onCancel: () => {
                  setNewComment('');
                  setIsAddingComment(false);
                  setShowMentions(false);
                },
              })}
            </div>
          ) : null}

          {comments.length > 0 ? (
            <div className="comment-list">
              {comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))}
            </div>
          ) : null}

          {!canComment && readOnlyMessage ? (
            <div className="comment-readonly-note">{readOnlyMessage}</div>
          ) : null}
        </div>
      </div>

      {canComment && comments.length > 0 ? (
        <IconButton
          className="comment-add-toggle"
          size="sm"
          type="secondary"
          buttonStyle="mono"
          active={isAddingComment}
          onClick={() => {
            resetInlineState();
            setNewComment('');
            setIsAddingComment((current) => !current);
            setActiveComposer('new');
          }}
          aria-label={isAddingComment ? 'Cancel comment' : 'Add comment'}
          title={isAddingComment ? 'Cancel' : 'Add comment'}
        >
          {isAddingComment ? <MessageSquareOffIcon /> : <MessageSquarePlus />}
        </IconButton>
      ) : null}
    </div>
  );
};

export default CommentPopover;
