import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  MessageSquarePlus,
  PencilLine,
  Reply,
  Share,
  Smile,
  Trash2,
  X,
} from 'lucide-react';

import classNames from '../../utils/classNames';
import Avatar from '../ui/Avatar';
import IconButton from '../ui/IconButton';
import TextareaInput from '../ui/TextareaInput';

const sameCommentId = (a, b) => String(a ?? '') === String(b ?? '');
const COMMENT_EMOJI_PICKER_WIDTH = 320;

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

const hasCommentInThread = (comment, commentId) => {
  if (sameCommentId(comment?.id, commentId)) return true;
  return (comment?.replies || []).some((reply) => hasCommentInThread(reply, commentId));
};

const isCommentAuthor = (comment, currentUser) => {
  if (!comment || !currentUser?.id) return false;
  return sameCommentId(comment.authorUserId, currentUser.id);
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

function EmojiPickerPopover({ anchor, onSelect }) {
  const pickerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || window.customElements?.get('emoji-picker')) return undefined;
    let canceled = false;
    import('emoji-picker-element').catch(() => {
      if (!canceled) {
        // The picker shell still renders; build/test environments may not upgrade the custom element.
      }
    });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return undefined;

    const handleEmojiClick = (event) => {
      const unicode = event.detail?.unicode || event.detail?.emoji?.unicode;
      if (unicode) onSelect(unicode);
    };

    picker.addEventListener('emoji-click', handleEmojiClick);
    return () => picker.removeEventListener('emoji-click', handleEmojiClick);
  }, [onSelect]);

  return (
    <div
      className="comment-emoji-popover"
      role="dialog"
      aria-label="Emoji picker"
      style={{ left: `${anchor.left}px`, top: `${anchor.top}px` }}
      onWheel={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <emoji-picker ref={pickerRef} className="comment-emoji-picker-element" />
    </div>
  );
}

function CommentComposer({
  className,
  placeholder,
  value,
  composerId,
  inputRef,
  showCancel = false,
  showMentions = false,
  showEmojiPicker = false,
  collaborators = [],
  onFocus,
  onChange,
  onSubmit,
  onCancel,
  onEscapeMentions,
  onToggleEmoji,
  onInsertMention,
}) {
  const canSubmit = value.trim().length > 0;

  return (
    <div className={classNames('comment-input-wrapper', className)}>
      <TextareaInput
        ref={inputRef}
        className="comment-input"
        placeholder={placeholder}
        value={value}
        onFocus={onFocus}
        onChange={onChange}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.shiftKey || event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSubmit();
            return;
          }
          if (event.key === 'Escape') {
            if (showMentions) {
              onEscapeMentions();
              return;
            }
            onCancel?.();
          }
        }}
      />
      <div className="comment-input-actions">
        <IconButton
          size="xs"
          variant="ghost"
          className="comment-emoji-toggle"
          onClick={(event) => onToggleEmoji?.(event)}
          aria-label="Insert emoji"
          aria-expanded={showEmojiPicker ? 'true' : 'false'}
          title="Insert emoji"
        >
          <Smile />
        </IconButton>
        {showCancel ? (
          <IconButton
            size="xs"
            variant="ghost"
            className="comment-input-cancel"
            onClick={onCancel}
            aria-label="Cancel reply"
            title="Cancel"
          >
            <MessageSquareOffIcon />
          </IconButton>
        ) : null}
        {canSubmit ? (
          <IconButton
            size="xs"
            variant="ghost"
            buttonStyle="mono"
            onClick={onSubmit}
            aria-label="Share comment"
            title="Share comment"
          >
            <Share />
          </IconButton>
        ) : null}
      </div>
      {showMentions && collaborators.length > 0 ? (
        <div className="mention-dropdown">
          {collaborators.map((name) => (
            <button
              type="button"
              key={name}
              className="mention-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onInsertMention(name)}
            >
              @{name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CommentItem({
  comment,
  depth = 0,
  nodeId,
  activeCommentId,
  currentUser,
  canComment,
  canResolveComments,
  replyingTo,
  editingCommentId,
  replyDraft,
  editDraft,
  replyInputRef,
  editInputRef,
  activeComposer,
  showMentions,
  showEmojiPicker,
  filteredCollaborators,
  formatTimeAgo,
  onBeginReply,
  onBeginEdit,
  onReplyChange,
  onEditChange,
  onReplySubmit,
  onEditSubmit,
  onReplyCancel,
  onEditCancel,
  onDeleteComment,
  onSetCommentCompleted,
  onSetActiveComposer,
  onClearMentions,
  onToggleEmoji,
  onInsertEmoji,
  onInsertMention,
}) {
  const isReplyTarget = sameCommentId(replyingTo, comment.id);
  const isEditing = sameCommentId(editingCommentId, comment.id);
  const isReply = depth > 0;
  const canEditThisComment = isCommentAuthor(comment, currentUser);
  const completedTime = comment.completedAt ? formatTimeAgo(comment.completedAt) : '';
  const composerId = isReplyTarget ? `reply:${comment.id}` : `edit:${comment.id}`;

  return (
    <div
      className={classNames(
        'comment-item',
        isReply && 'is-reply',
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
                {canEditThisComment ? (
                  <IconButton
                    size="xxs"
                    variant="ghost"
                    className="comment-action-btn"
                    onClick={() => onBeginEdit(comment)}
                    aria-label="Edit comment"
                    title="Edit comment"
                  >
                    <PencilLine />
                  </IconButton>
                ) : null}
                {canEditThisComment ? (
                  <IconButton
                    size="xxs"
                    variant="ghost"
                    className="comment-action-btn"
                    onClick={() => onDeleteComment?.(nodeId, comment.id)}
                    aria-label="Delete comment"
                    title="Delete comment"
                  >
                    <Trash2 />
                  </IconButton>
                ) : null}
                <IconButton
                  size="xxs"
                  variant="ghost"
                  className="comment-action-btn"
                  onClick={() => onBeginReply(comment.id)}
                  aria-label="Reply to comment"
                  title="Reply"
                >
                  <Reply />
                </IconButton>
                {!isReply && canResolveComments ? (
                  <IconButton
                    size="xxs"
                    variant="ghost"
                    className={classNames('comment-action-btn comment-complete-btn', comment.completed && 'checked')}
                    onClick={() => onSetCommentCompleted(comment)}
                    aria-label={comment.completed ? 'Reopen comment thread' : 'Resolve comment thread'}
                    title={comment.completed ? 'Reopen thread' : 'Resolve thread'}
                  >
                    <CheckCircle2 />
                  </IconButton>
                ) : null}
              </div>
            ) : null}
          </div>
          {isEditing ? (
            <CommentComposer
              className="comment-edit-composer"
              placeholder="Edit comment..."
              value={editDraft}
              composerId={`edit:${comment.id}`}
              inputRef={editInputRef}
              showMentions={showMentions && activeComposer === `edit:${comment.id}`}
              showEmojiPicker={showEmojiPicker === `edit:${comment.id}`}
              collaborators={filteredCollaborators}
              onFocus={() => onSetActiveComposer(`edit:${comment.id}`)}
              onChange={onEditChange(`edit:${comment.id}`)}
              onSubmit={() => onEditSubmit(comment.id)}
              onCancel={onEditCancel}
              onEscapeMentions={onClearMentions}
              onToggleEmoji={(event) => onToggleEmoji(`edit:${comment.id}`, event)}
              onInsertEmoji={onInsertEmoji}
              onInsertMention={onInsertMention}
            />
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
          <CommentComposer
            placeholder="Write a reply..."
            value={replyDraft}
            composerId={composerId}
            inputRef={replyInputRef}
            showCancel
            showMentions={showMentions && activeComposer === composerId}
            showEmojiPicker={showEmojiPicker === composerId}
            collaborators={filteredCollaborators}
            onFocus={() => onSetActiveComposer(composerId)}
            onChange={onReplyChange(composerId)}
            onSubmit={() => onReplySubmit(comment.id)}
            onCancel={onReplyCancel}
            onEscapeMentions={onClearMentions}
            onToggleEmoji={(event) => onToggleEmoji(composerId, event)}
            onInsertEmoji={onInsertEmoji}
            onInsertMention={onInsertMention}
          />
        </div>
      ) : null}
      {comment.replies?.length > 0 ? (
        <div className="comment-replies">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              nodeId={nodeId}
              activeCommentId={activeCommentId}
              currentUser={currentUser}
              canComment={canComment}
              canResolveComments={canResolveComments}
              replyingTo={replyingTo}
              editingCommentId={editingCommentId}
              replyDraft={replyDraft}
              editDraft={editDraft}
              replyInputRef={replyInputRef}
              editInputRef={editInputRef}
              activeComposer={activeComposer}
              showMentions={showMentions}
              showEmojiPicker={showEmojiPicker}
              filteredCollaborators={filteredCollaborators}
              formatTimeAgo={formatTimeAgo}
              onBeginReply={onBeginReply}
              onBeginEdit={onBeginEdit}
              onReplyChange={onReplyChange}
              onEditChange={onEditChange}
              onReplySubmit={onReplySubmit}
              onEditSubmit={onEditSubmit}
              onReplyCancel={onReplyCancel}
              onEditCancel={onEditCancel}
              onDeleteComment={onDeleteComment}
              onSetCommentCompleted={onSetCommentCompleted}
              onSetActiveComposer={onSetActiveComposer}
              onClearMentions={onClearMentions}
              onToggleEmoji={onToggleEmoji}
              onInsertEmoji={onInsertEmoji}
              onInsertMention={onInsertMention}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

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
  canResolveComments = false,
  currentUser = null,
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(null);
  const [emojiAnchor, setEmojiAnchor] = useState({ left: 0, top: 0 });
  const [isAddingComment, setIsAddingComment] = useState(false);
  const popoverRef = useRef(null);
  const newInputRef = useRef(null);
  const replyInputRef = useRef(null);
  const editInputRef = useRef(null);

  const comments = useMemo(
    () => sortCommentsNewestFirst(Array.isArray(node?.comments) ? node.comments : []),
    [node?.comments]
  );
  const visibleComments = useMemo(
    () => comments.filter((comment) => !comment.completed || hasCommentInThread(comment, activeCommentId)),
    [activeCommentId, comments]
  );
  const allComments = useMemo(() => flattenComments(visibleComments), [visibleComments]);
  const allCommentIds = useMemo(() => allComments.map((comment) => comment.id), [allComments]);
  const allCommentsResolved = allComments.length > 0 && allComments.every((comment) => comment.completed);
  const showNewComposer = canComment && (visibleComments.length === 0 || isAddingComment);

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

  const focusActiveComposer = () => {
    if (activeComposer === 'new') {
      newInputRef.current?.focus();
    } else if (activeComposer === `reply:${replyingTo}`) {
      replyInputRef.current?.focus();
    } else if (activeComposer === `edit:${editingCommentId}`) {
      editInputRef.current?.focus();
    }
  };

  const updateMentionState = (value) => {
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(' ')) {
        setShowMentions(true);
        setMentionFilter(textAfterAt.toLowerCase());
        setShowEmojiPicker(null);
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
    focusActiveComposer();
    setShowMentions(false);
  };

  const insertEmoji = (emoji) => {
    const activeInput = activeComposer === 'new'
      ? newInputRef.current
      : activeComposer === `reply:${replyingTo}`
        ? replyInputRef.current
        : editInputRef.current;
    const currentValue = getActiveComposerValue();
    const start = activeInput?.selectionStart ?? currentValue.length;
    const end = activeInput?.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${emoji}${currentValue.slice(end)}`;
    setActiveComposerValue(nextValue);
    setShowEmojiPicker(null);
    requestAnimationFrame(() => {
      focusActiveComposer();
      const nextCursor = start + emoji.length;
      activeInput?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const filteredCollaborators = (collaborators || []).filter((name) =>
    String(name || '').toLowerCase().includes(mentionFilter)
  );

  const toggleEmojiPicker = (composerId, event) => {
    setActiveComposer(composerId);
    const buttonRect = event?.currentTarget?.getBoundingClientRect?.();
    const popoverRect = popoverRef.current?.getBoundingClientRect?.();
    if (buttonRect && popoverRect) {
      const maxLeft = Math.max(0, popoverRect.width - COMMENT_EMOJI_PICKER_WIDTH);
      setEmojiAnchor({
        left: Math.min(Math.max(0, buttonRect.left - popoverRect.left), maxLeft),
        top: Math.max(0, buttonRect.bottom - popoverRect.top + 4),
      });
    }
    setShowEmojiPicker((current) => (current === composerId ? null : composerId));
  };

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

  useEffect(() => {
    if (!showEmojiPicker) return undefined;

    const handlePointerDown = (event) => {
      if (event.target.closest('.comment-emoji-popover')) return;
      if (event.target.closest('.comment-emoji-toggle')) return;
      setShowEmojiPicker(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowEmojiPicker(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showEmojiPicker]);

  const resetInlineState = () => {
    setReplyingTo(null);
    setReplyDraft('');
    setEditingCommentId(null);
    setEditDraft('');
    setShowMentions(false);
    setShowEmojiPicker(null);
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
    setShowEmojiPicker(null);
  };

  const handleReplySubmit = (commentId) => {
    if (!replyDraft.trim()) return;
    onAddComment(node.id, replyDraft, commentId);
    setReplyDraft('');
    setReplyingTo(null);
    setShowMentions(false);
    setShowEmojiPicker(null);
  };

  const handleEditSubmit = (commentId) => {
    if (!editDraft.trim()) return;
    onUpdateComment?.(node.id, commentId, editDraft);
    setEditDraft('');
    setEditingCommentId(null);
    setShowMentions(false);
    setShowEmojiPicker(null);
  };

  const beginReply = (commentId) => {
    setIsAddingComment(false);
    setEditingCommentId(null);
    setEditDraft('');
    setReplyingTo(commentId);
    setReplyDraft('');
    setActiveComposer(`reply:${commentId}`);
    setShowMentions(false);
    setShowEmojiPicker(null);
  };

  const beginEdit = (comment) => {
    setIsAddingComment(false);
    setReplyingTo(null);
    setReplyDraft('');
    setEditingCommentId(comment.id);
    setEditDraft(comment.text || '');
    setActiveComposer(`edit:${comment.id}`);
    setShowMentions(false);
    setShowEmojiPicker(null);
  };

  const handleSetCommentCompleted = (comment) => {
    const ids = collectCommentIds([comment]);
    const completed = !comment.completed;
    if (onSetCommentsCompleted) {
      onSetCommentsCompleted(node.id, ids, completed);
      if (completed) handleClose();
      return;
    }
    onToggleCompleted?.(node.id, comment.id);
    if (completed) handleClose();
  };

  const handleSetAllCompleted = () => {
    if (allCommentIds.length === 0) return;
    const completed = !allCommentsResolved;
    onSetCommentsCompleted?.(node.id, allCommentIds, completed);
    if (completed) handleClose();
  };

  return (
    <>
    <div
      ref={popoverRef}
      className={classNames(
        'comment-popover modal-card',
        canComment && visibleComments.length > 0 && 'has-add-toggle'
      )}
      role="dialog"
      aria-label={`Comments on ${node.title || 'Untitled'}`}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="comment-popover-header modal-header">
        <div className="comment-popover-heading">
          <h3>Comments on "{node.title || 'Untitled'}"</h3>
          {canResolveComments && visibleComments.length > 0 ? (
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
                aria-label={allCommentsResolved ? 'Reopen all comments' : 'Resolve all comments'}
                title={allCommentsResolved ? 'Reopen all comments' : 'Resolve all comments'}
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
              <CommentComposer
                placeholder="Add a comment... (use @ to mention)"
                value={newComment}
                composerId="new"
                inputRef={newInputRef}
                showMentions={showMentions && activeComposer === 'new'}
                showEmojiPicker={showEmojiPicker === 'new'}
                collaborators={filteredCollaborators}
                onFocus={() => setActiveComposer('new')}
                onChange={handleInputChange('new', setNewComment)}
                onSubmit={handleAddSubmit}
                onCancel={() => {
                  setNewComment('');
                  setIsAddingComment(false);
                  setShowMentions(false);
                  setShowEmojiPicker(null);
                }}
                onEscapeMentions={() => setShowMentions(false)}
                onToggleEmoji={(event) => toggleEmojiPicker('new', event)}
                onInsertEmoji={insertEmoji}
                onInsertMention={insertMention}
              />
            </div>
          ) : null}

          {visibleComments.length > 0 ? (
            <div className="comment-list">
              {visibleComments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  nodeId={node.id}
                  activeCommentId={activeCommentId}
                  currentUser={currentUser}
                  canComment={canComment}
                  canResolveComments={canResolveComments}
                  replyingTo={replyingTo}
                  editingCommentId={editingCommentId}
                  replyDraft={replyDraft}
                  editDraft={editDraft}
                  replyInputRef={replyInputRef}
                  editInputRef={editInputRef}
                  activeComposer={activeComposer}
                  showMentions={showMentions}
                  showEmojiPicker={showEmojiPicker}
                  filteredCollaborators={filteredCollaborators}
                  formatTimeAgo={formatTimeAgo}
                  onBeginReply={beginReply}
                  onBeginEdit={beginEdit}
                  onReplyChange={(composerId) => handleInputChange(composerId, setReplyDraft)}
                  onEditChange={(composerId) => handleInputChange(composerId, setEditDraft)}
                  onReplySubmit={handleReplySubmit}
                  onEditSubmit={handleEditSubmit}
                  onReplyCancel={() => {
                    setReplyingTo(null);
                    setReplyDraft('');
                    setShowMentions(false);
                    setShowEmojiPicker(null);
                  }}
                  onEditCancel={() => {
                    setEditingCommentId(null);
                    setEditDraft('');
                    setShowMentions(false);
                    setShowEmojiPicker(null);
                  }}
                  onDeleteComment={onDeleteComment}
                  onSetCommentCompleted={handleSetCommentCompleted}
                  onSetActiveComposer={setActiveComposer}
                  onClearMentions={() => setShowMentions(false)}
                  onToggleEmoji={toggleEmojiPicker}
                  onInsertEmoji={insertEmoji}
                  onInsertMention={insertMention}
                />
              ))}
            </div>
          ) : null}

          {!canComment && readOnlyMessage ? (
            <div className="comment-readonly-note">{readOnlyMessage}</div>
          ) : null}
        </div>
      </div>

      {canComment && visibleComments.length > 0 ? (
        <IconButton
          className="comment-add-toggle"
          size="sm"
          type="primary"
          buttonStyle="mono"
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
    {showEmojiPicker ? (
      <EmojiPickerPopover anchor={emojiAnchor} onSelect={insertEmoji} />
    ) : null}
    </>
  );
};

export default CommentPopover;
