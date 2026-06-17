import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, CheckCircle2, ListFilter, Trash2 } from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';
import IconButton from '../ui/IconButton';
import { MenuItem, MenuPanel, MenuSection } from '../ui/Menu';
import SearchInput from '../ui/SearchInput';

const sameCommentId = (a, b) => String(a ?? '') === String(b ?? '');

const COMMENT_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'mentions', label: 'My mentions' },
  { value: 'resolved', label: 'Resolved' },
];

const COMMENT_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

const buildUserMentionKeys = (user) => {
  const tokens = new Set();
  const addTokens = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return;
    tokens.add(normalized);
    normalized
      .split(/[^a-z0-9_]+/i)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
      .forEach((token) => tokens.add(token));
  };

  addTokens(user?.name);
  addTokens(user?.email ? String(user.email).split('@')[0] : '');
  addTokens(user?.username);
  addTokens(user?.id);

  return tokens;
};

const getCommentMentionTokens = (comment) => {
  const savedMentions = Array.isArray(comment.mentions) ? comment.mentions : [];
  const textMentions = String(comment.text || '').match(/@(\w+)/g) || [];
  return [...savedMentions, ...textMentions.map((mention) => mention.slice(1))];
};

const CommentsPanel = ({
  isOpen,
  root,
  orphans,
  currentUser,
  selectedCommentId,
  onClose,
  onCommentClick,
  onDeleteComment,
  onToggleCompleted,
  onNavigateToNode,
}) => {
  const [filter, setFilter] = useState('');
  const [sortMode, setSortMode] = useState('newest');
  const [statusFilters, setStatusFilters] = useState({ open: true, resolved: true });
  const [openMenu, setOpenMenu] = useState(null);
  const controlsRef = useRef(null);

  const mentionKeys = useMemo(() => buildUserMentionKeys(currentUser), [currentUser]);

  useEffect(() => {
    if (!openMenu) return undefined;

    const handlePointerDown = (event) => {
      if (controlsRef.current?.contains(event.target)) return;
      setOpenMenu(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

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
  const isUserMentioned = (comment) => {
    if (!mentionKeys.size) return false;
    return getCommentMentionTokens(comment).some((mention) => (
      mentionKeys.has(String(mention || '').trim().toLowerCase())
    ));
  };

  const navigateToComment = (comment) => {
    if (onCommentClick) {
      onCommentClick(comment.nodeId, comment.id);
      return;
    }
    onNavigateToNode?.(comment.nodeId);
  };

  const toggleStatusFilter = (value) => {
    setStatusFilters((prev) => {
      const activeCount = Object.values(prev).filter(Boolean).length;
      if (prev[value] && activeCount === 1) return prev;
      return {
        ...prev,
        [value]: !prev[value],
      };
    });
  };

  const filteredComments = allComments.filter(comment => {
    const statusKey = comment.completed ? 'resolved' : 'open';
    if (!statusFilters[statusKey]) return false;

    if (!filter) return true;
    const searchLower = filter.toLowerCase();

    return (
      comment.text.toLowerCase().includes(searchLower) ||
      comment.author.toLowerCase().includes(searchLower) ||
      comment.nodeTitle.toLowerCase().includes(searchLower)
    );
  }).sort((a, b) => {
    if (sortMode === 'mentions') {
      const mentionDelta = Number(isUserMentioned(b)) - Number(isUserMentioned(a));
      if (mentionDelta !== 0) return mentionDelta;
    }

    if (sortMode === 'resolved') {
      const resolvedDelta = Number(b.completed) - Number(a.completed);
      if (resolvedDelta !== 0) return resolvedDelta;
    }

    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const sortLabel = COMMENT_SORT_OPTIONS.find((option) => option.value === sortMode)?.label || 'Newest';

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
            size="sm"
            placeholder="Search comments"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onClear={() => setFilter('')}
            className="comments-filter-input"
          />
          <div className="comments-panel-controls" ref={controlsRef}>
            <div className="comments-panel-menu-wrapper">
              <IconButton
                size="sm"
                type="secondary"
                buttonStyle="mono"
                className="comments-panel-control-button"
                active={openMenu === 'sort'}
                onClick={() => setOpenMenu((current) => (current === 'sort' ? null : 'sort'))}
                aria-label={`Sort comments: ${sortLabel}`}
                aria-expanded={openMenu === 'sort'}
                aria-haspopup="menu"
                title="Sort comments"
              >
                <ArrowUpDown />
              </IconButton>
              {openMenu === 'sort' ? (
                <MenuPanel className="comments-panel-menu" role="menu" aria-label="Sort comments">
                  <MenuSection>
                    {COMMENT_SORT_OPTIONS.map((option) => {
                      const isActive = sortMode === option.value;
                      return (
                        <MenuItem
                          key={option.value}
                          className="comments-panel-menu-item"
                          role="menuitemradio"
                          aria-checked={isActive}
                          label={option.label}
                          onClick={() => {
                            setSortMode(option.value);
                            setOpenMenu(null);
                          }}
                          endSlot={isActive ? <span className="comments-panel-menu-dot" /> : null}
                        />
                      );
                    })}
                  </MenuSection>
                </MenuPanel>
              ) : null}
            </div>
            <div className="comments-panel-menu-wrapper">
              <IconButton
                size="sm"
                type="secondary"
                buttonStyle="mono"
                className="comments-panel-control-button"
                active={openMenu === 'filter'}
                onClick={() => setOpenMenu((current) => (current === 'filter' ? null : 'filter'))}
                aria-label="Filter comments"
                aria-expanded={openMenu === 'filter'}
                aria-haspopup="menu"
                title="Filter comments"
              >
                <ListFilter />
              </IconButton>
              {openMenu === 'filter' ? (
                <MenuPanel className="comments-panel-menu" role="menu" aria-label="Filter comments">
                  <MenuSection>
                    {COMMENT_STATUS_OPTIONS.map((option) => {
                      const isActive = Boolean(statusFilters[option.value]);
                      return (
                        <MenuItem
                          key={option.value}
                          className="comments-panel-menu-item"
                          role="menuitemcheckbox"
                          aria-checked={isActive}
                          label={option.label}
                          onClick={() => toggleStatusFilter(option.value)}
                          endSlot={isActive ? <span className="comments-panel-menu-dot" /> : null}
                        />
                      );
                    })}
                  </MenuSection>
                </MenuPanel>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="comments-panel-body">
        {filteredComments.length > 0 ? (
          <div className="comments-panel-list">
            {filteredComments.map(comment => {
              const isSelected = sameCommentId(selectedCommentId, comment.id);
              const completedTime = comment.completedAt ? formatTimeAgo(comment.completedAt) : '';
              return (
                <div
                  key={comment.id}
                  className={`comments-panel-item${isSelected ? ' is-selected' : ''}${comment.completed ? ' is-resolved' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => navigateToComment(comment)}
                  onKeyDown={(event) => {
                    if (event.currentTarget !== event.target) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigateToComment(comment);
                    }
                  }}
                >
                  <div className="comments-panel-item-header">
                    <span className="comments-panel-node-title">{comment.nodeTitle}</span>
                    <div className="comments-panel-actions">
                      {onDeleteComment ? (
                        <IconButton
                          size="xs"
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
                      {onToggleCompleted ? (
                        <IconButton
                          size="xs"
                          variant="ghost"
                          className={`comments-panel-complete${comment.completed ? ' checked' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleCompleted(comment.nodeId, comment.id);
                          }}
                          aria-label={comment.completed ? 'Mark comment as incomplete' : 'Mark comment as complete'}
                        >
                          <CheckCircle2 />
                        </IconButton>
                      ) : null}
                    </div>
                  </div>
                  <div className="comments-panel-text">{comment.text}</div>
                  <div className="comments-panel-meta-row">
                    <div className="comments-panel-item-meta">
                      <span className="comments-panel-author">{comment.author}</span>
                      <span className="comments-panel-time">{formatTimeAgo(comment.createdAt)}</span>
                    </div>
                    {comment.completed && comment.completedBy ? (
                      <div className="comments-panel-completed-info">
                        <span className="comments-panel-completed-author">{comment.completedBy}</span>
                        {completedTime ? (
                          <span className="comments-panel-completed-time">{completedTime}</span>
                        ) : null}
                      </div>
                    ) : null}
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
