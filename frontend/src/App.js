import React, { useLayoutEffect, useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  Download,
  Share2,
  Bookmark,
  Plus,
  GripVertical,
  Trash2,
  Edit2,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  LogIn,
  LogOut,
  Folder,
  Palette,
  ChevronDown,
  ChevronUp,
  Loader2,
  Globe,
  AlertTriangle,
  FileJson,
  FileImage,
  FileText,
  FileSpreadsheet,
  Mail,
  Copy,
  Check,
  FolderPlus,
  Map,
  Info,
  CheckCircle,
  XCircle,
  ExternalLink,
  List,
  History,
  Scan,
  CheckSquare,
  Square,
  User,
  Eye,
  EyeOff,
  Upload,
  FileUp,
  Undo2,
  Redo2,
  MousePointer2,
  Link,
  Workflow,
  Eye as EyeIcon,
} from 'lucide-react';
import './App.css';
import * as api from './api';
import LandingPage from './LandingPage';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000';
const DEFAULT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const SCAN_MESSAGES = [
  "Discovering pages...",
  "Mapping your site structure...",
  "Finding all the hidden gems...",
  "Building your sitemap...",
  "Analyzing page hierarchy...",
  "Almost there...",
  "Connecting the dots...",
  "Exploring your website...",
  "Gathering page information...",
  "Creating something beautiful...",
  "Following the links...",
  "Deep diving into your site...",
  "Organizing your pages...",
  "Making progress...",
  "This is looking great!",
];

const sanitizeUrl = (raw) => {
  if (!raw) return '';
  let t = raw.trim();

  // Add https:// if no protocol specified
  if (t && !t.match(/^https?:\/\//i)) {
    t = 'https://' + t;
  }

  try {
    const u = new URL(t);
    return u.toString();
  } catch {
    return '';
  }
};

const downloadText = (filename, text) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};


const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const getHostname = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const getMaxDepth = (node, depth = 0) => {
  if (!node) return 0;
  if (!node.children?.length) return depth;
  return Math.max(...node.children.map(c => getMaxDepth(c, depth + 1)));
};

const countNodes = (node) => {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, c) => sum + countNodes(c), 0);
};

const NodeCard = ({
  node,
  number,
  color,
  showThumbnails,
  onAdd,
  onDelete,
  onEdit,
  onViewImage,
  isRoot,
  onDragStart,
  isDragging,
  onClick,
  isConnectionMode,
}) => {
  const [thumbError, setThumbError] = useState(false);
  const [thumbLoading, setThumbLoading] = useState(true);
  const [thumbKey, setThumbKey] = useState(0);

  // Use mshots for thumbnails - add cache buster to force refresh
  const thumb = `https://s0.wp.com/mshots/v1/${encodeURIComponent(node.url)}?w=576&h=400&_=${thumbKey}`;

  // Reset thumbnail state when showThumbnails is toggled on
  React.useEffect(() => {
    if (showThumbnails) {
      setThumbError(false);
      setThumbLoading(true);
      setThumbKey(k => k + 1); // Force new image request
    }
  }, [showThumbnails]);

  // Timeout fallback - if thumbnail doesn't load in 15 seconds, show placeholder
  React.useEffect(() => {
    if (!showThumbnails) return;
    const timeout = setTimeout(() => {
      if (thumbLoading) {
        setThumbError(true);
        setThumbLoading(false);
      }
    }, 15000);
    return () => clearTimeout(timeout);
  }, [showThumbnails, thumbLoading, thumbKey]);

  const handleViewFull = () => {
    onViewImage(node.url);
  };

  const handleCardPointerDown = (e) => {
    // Don't start drag from buttons or in connection mode
    if (isRoot) return;
    if (isConnectionMode) return;
    if (e.target.closest('.card-actions') || e.target.closest('.thumb-view-btn')) return;

    e.preventDefault();
    e.stopPropagation();
    onDragStart?.(node, e);
  };

  const handleCardClick = (e) => {
    if (!isConnectionMode || !onClick) return;
    e.stopPropagation();
    onClick(node.id);
  };

  return (
    <div
      className={`node-card ${isDragging ? 'dragging' : ''} ${isConnectionMode ? 'connection-mode' : ''}`}
      data-node-card="1"
      data-node-id={node.id}
      onClick={handleCardClick}
      onPointerDown={handleCardPointerDown}
      style={{ cursor: isRoot || isConnectionMode ? 'default' : 'grab' }}
    >
      <div
        className="card-header"
        style={{ backgroundColor: color }}
      >
        {/* Color bar only - no drag handle needed since entire card is draggable */}
      </div>

      {showThumbnails && (
        <div className="card-thumb">
          {thumbLoading && !thumbError && (
            <div className="thumb-placeholder">
              <Loader2 size={24} className="thumb-spinner" />
            </div>
          )}
          {!thumbLoading && !thumbError ? (
            <img
              className="thumb-img"
              src={thumb}
              alt={node.title}
              loading="lazy"
              onLoad={() => setThumbLoading(false)}
              onError={() => { setThumbError(true); setThumbLoading(false); }}
            />
          ) : thumbError ? (
            <div className="thumb-placeholder">
              <Globe size={24} strokeWidth={1.5} />
              <span className="thumb-placeholder-text">{getHostname(node.url)}</span>
            </div>
          ) : null}
          {/* View full image button */}
          {!thumbError && !thumbLoading && (
            <button
              className="thumb-view-btn"
              onClick={(e) => { e.stopPropagation(); handleViewFull(); }}
              title="View full screenshot"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      )}

      <div className="card-content">
        <div className="card-toprow">
          <span className="page-number">{number}</span>
        </div>

        <div className="card-title" title={node.title}>
          {node.title}
        </div>
      </div>

      <div className="card-actions">
        <button className="btn-icon" title="Add Child" onClick={() => onAdd(node.id)}>
          <Plus size={14} />
        </button>
        {!isRoot && (
          <button className="btn-icon danger" title="Delete" onClick={() => onDelete(node.id)}>
            <Trash2 size={14} />
          </button>
        )}
        <button className="btn-icon" title="Edit Title" onClick={() => onEdit(node)}>
          <Edit2 size={14} />
        </button>
        <a
          href={node.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-icon external-link-btn"
          title="Open in new tab"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
};

// Minimum number of similar children to trigger stacking
const STACK_THRESHOLD = 5;

const SitemapTree = ({
  data,
  depth = 0,
  numberPrefix = '1',
  showThumbnails,
  colors,
  scale = 1,
  onAdd,
  onDelete,
  onEdit,
  onViewImage,
  onNodeDoubleClick,
  onNodeClick,
  onDragStart,
  draggedNodeId,
  dropIndicator,
  isConnectionMode,
}) => {
  const myColor = colors[Math.min(depth, colors.length - 1)];

  const parentWrapRef = useRef(null);
  const childrenWrapRef = useRef(null);
  const childRefs = useRef([]);
  const [paths, setPaths] = useState([]);
  const [expandedStacks, setExpandedStacks] = useState({});

  // Check if children should be stacked (many similar siblings with same URL pattern)
  // Only stack if children share a common path pattern (e.g., /blog/*, /articles/*)
  const shouldStack = (() => {
    if (!data.children || data.children.length < STACK_THRESHOLD) return false;
    // Don't stack root level or first level children (main nav items)
    if (depth < 2) return false;
    // Check if children have similar URL patterns
    try {
      const paths = data.children.map(c => new URL(c.url).pathname);
      // Get the parent path of first child
      const firstPath = paths[0].split('/').slice(0, -1).join('/');
      // Check if at least 80% of children share the same parent path
      const matchingPaths = paths.filter(p => p.startsWith(firstPath + '/'));
      return matchingPaths.length >= data.children.length * 0.8;
    } catch {
      return false;
    }
  })();
  const isStackExpanded = expandedStacks[data.id];

  const toggleStack = () => {
    setExpandedStacks(prev => ({ ...prev, [data.id]: !prev[data.id] }));
  };

  childRefs.current = [];

  useLayoutEffect(() => {
    if (!childrenWrapRef.current || !parentWrapRef.current) return;
    if (!data?.children?.length) return;

    const container = childrenWrapRef.current;
    const parent = parentWrapRef.current;

    const calc = () => {
      const crect = container.getBoundingClientRect();
      const prect = parent.getBoundingClientRect();

      // Divide by scale to convert viewport coords to local SVG coords
      const s = scale || 1;
      const px = (prect.left + prect.width / 2 - crect.left) / s;
      const py = (prect.bottom - crect.top) / s;

      const gap = 40; // Equal spacing above and below trunk line (half of children margin-top: 80px)
      const trunkY = py + gap;

      const childPoints = childRefs.current
        .map((el) => {
          if (!el) return null;
          // Find the actual node card inside the child-wrap
          const nodeCard = el.querySelector('[data-node-card="1"]');
          const r = nodeCard ? nodeCard.getBoundingClientRect() : el.getBoundingClientRect();
          return { x: (r.left + r.width / 2 - crect.left) / s, y: (r.top - crect.top) / s };
        })
        .filter(Boolean);

      if (!childPoints.length) {
        setPaths([]);
        return;
      }

      const p = [];
      p.push(`M ${px} ${py} L ${px} ${trunkY}`);

      if (childPoints.length === 1) {
        const c = childPoints[0];
        p.push(`M ${px} ${trunkY} L ${c.x} ${trunkY} L ${c.x} ${c.y}`);
      } else {
        const xs = childPoints.map((c) => c.x);
        const minX = Math.min(...xs, px);
        const maxX = Math.max(...xs, px);

        p.push(`M ${minX} ${trunkY} L ${maxX} ${trunkY}`);

        childPoints.forEach((c) => {
          p.push(`M ${c.x} ${trunkY} L ${c.x} ${c.y}`);
        });
      }
      setPaths(p);
    };

    calc();

    const ro = new ResizeObserver(() => calc());
    ro.observe(container);
    ro.observe(parent);
    childRefs.current.forEach((el) => el && ro.observe(el));

    window.addEventListener('resize', calc);
    return () => {
      window.removeEventListener('resize', calc);
      ro.disconnect();
    };
  }, [data, showThumbnails, depth, scale]);

  const childrenClass = depth === 0 ? 'children children-row' : 'children children-col';

  return (
    <div className="tree">
      <div
        ref={parentWrapRef}
        className="parent-wrap"
        data-node-id={data.id}
        data-depth={depth}
        onDoubleClick={() => onNodeDoubleClick?.(data.id)}
      >
        <NodeCard
          key={data.id}
          node={data}
          number={numberPrefix}
          color={myColor}
          showThumbnails={showThumbnails}
          isRoot={depth === 0}
          onAdd={onAdd}
          onDelete={onDelete}
          onEdit={onEdit}
          onViewImage={onViewImage}
          onDragStart={onDragStart}
          isDragging={draggedNodeId === data.id}
          onClick={onNodeClick}
          isConnectionMode={isConnectionMode}
        />
        {/* Child drop zone indicator - card-sized ghost */}
        {dropIndicator?.type === 'child' && dropIndicator?.parentId === data.id && !data.children?.length && (
          <div className="drop-indicator-child" />
        )}
      </div>

      {!!data.children?.length && (
        <div className={childrenClass} ref={childrenWrapRef}>
          <svg className="connector-svg" aria-hidden="true">
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#94a3b8" strokeWidth="2" />
            ))}
          </svg>

          {shouldStack && !isStackExpanded ? (
            // Render stacked view
            <div
              className="child-wrap stacked-wrap"
              ref={(el) => (childRefs.current[0] = el)}
            >
              <div className="stacked-cards" onClick={toggleStack} title={`Click to expand ${data.children.length} pages`}>
                {/* Background cards (visual only) */}
                <div className="stacked-card stacked-card-3" />
                <div className="stacked-card stacked-card-2" />
                {/* Top card (the actual node) */}
                <div className="stacked-card stacked-card-1">
                  <SitemapTree
                    data={data.children[0]}
                    depth={depth + 1}
                    numberPrefix={`${numberPrefix}.1`}
                    showThumbnails={showThumbnails}
                    colors={colors}
                    scale={scale}
                    onAdd={onAdd}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    onViewImage={onViewImage}
                    onNodeDoubleClick={onNodeDoubleClick}
                    onNodeClick={onNodeClick}
                    onDragStart={onDragStart}
                    draggedNodeId={draggedNodeId}
                    dropIndicator={dropIndicator}
                    isConnectionMode={isConnectionMode}
                  />
                </div>
                <div className="stacked-count">
                  +{data.children.length - 1} more
                </div>
              </div>
            </div>
          ) : (
            // Render normal expanded view
            data.children.map((child, idx) => (
              <div
                key={child.id}
                className="child-wrap"
                ref={(el) => (childRefs.current[idx] = el)}
              >
                {/* Sibling drop zone indicator - slim line BEFORE this child */}
                {dropIndicator?.type === 'sibling' && dropIndicator?.parentId === data.id && dropIndicator?.index === idx && (
                  <div className={`drop-indicator-sibling ${depth === 0 ? 'horizontal' : 'vertical'}`} />
                )}
                <SitemapTree
                  data={child}
                  depth={depth + 1}
                  numberPrefix={`${numberPrefix}.${idx + 1}`}
                  showThumbnails={showThumbnails}
                  colors={colors}
                  scale={scale}
                  onAdd={onAdd}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onViewImage={onViewImage}
                  onNodeDoubleClick={onNodeDoubleClick}
                  onNodeClick={onNodeClick}
                  onDragStart={onDragStart}
                  draggedNodeId={draggedNodeId}
                  dropIndicator={dropIndicator}
                  isConnectionMode={isConnectionMode}
                />
                {/* Sibling drop zone indicator - slim line AFTER last child */}
                {idx === data.children.length - 1 && dropIndicator?.type === 'sibling' && dropIndicator?.parentId === data.id && dropIndicator?.index === data.children.length && (
                  <div className={`drop-indicator-sibling after ${depth === 0 ? 'horizontal' : 'vertical'}`} />
                )}
              </div>
            ))
          )}
          {/* Child drop zone indicator - card ghost at end of children */}
          {dropIndicator?.type === 'child' && dropIndicator?.parentId === data.id && data.children?.length > 0 && (
            <div className="drop-indicator-child" />
          )}

          {shouldStack && isStackExpanded && (
            <button className="collapse-stack-btn" onClick={toggleStack}>
              Collapse ({data.children.length} pages)
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Profile Modal for account management
const ProfileModal = ({ user, onClose, onUpdate, onLogout, showToast }) => {
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const updateData = {};
      if (name !== user.name) {
        updateData.name = name;
      }
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          setError('New passwords do not match');
          setLoading(false);
          return;
        }
        if (!currentPassword) {
          setError('Current password is required to change password');
          setLoading(false);
          return;
        }
        updateData.currentPassword = currentPassword;
        updateData.newPassword = newPassword;
      }

      if (Object.keys(updateData).length === 0) {
        setLoading(false);
        return;
      }

      const { user: updatedUser } = await api.updateProfile(updateData);
      onUpdate(updatedUser);
      setSuccess('Profile updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setError('Password is required to delete account');
      return;
    }
    setLoading(true);
    setError('');

    try {
      await api.deleteAccount(deletePassword);
      showToast('Account deleted', 'success');
      onLogout();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete account');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="profile-header">
          <div className="profile-avatar">
            <User size={32} />
          </div>
          <div className="profile-info">
            <h3>{user?.name}</h3>
            <span className="profile-email">{user?.email}</span>
          </div>
        </div>

        {!showDeleteConfirm ? (
          <form onSubmit={handleUpdateProfile} className="profile-form">
            {error && <div className="auth-error">{error}</div>}
            {success && <div className="auth-success">{success}</div>}

            <div className="form-section">
              <h4>Profile</h4>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
            </div>

            <div className="form-section">
              <h4>Change Password</h4>
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            <button
              type="submit"
              className="modal-btn primary"
              disabled={loading}
            >
              {loading ? <Loader2 size={18} className="btn-spinner" /> : null}
              Save Changes
            </button>

            <div className="form-section danger-zone">
              <h4>Danger Zone</h4>
              <p>Deleting your account will permanently remove all your projects, maps, and data.</p>
              <button
                type="button"
                className="modal-btn danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete Account
              </button>
            </div>
          </form>
        ) : (
          <div className="delete-confirm">
            <div className="delete-warning">
              <AlertTriangle size={48} />
              <h4>Delete Account?</h4>
              <p>This action cannot be undone. All your projects, maps, and scan history will be permanently deleted.</p>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label>Enter your password to confirm</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                autoFocus
              />
            </div>

            <div className="delete-actions">
              <button
                className="modal-btn danger"
                onClick={handleDeleteAccount}
                disabled={loading || !deletePassword}
              >
                {loading ? <Loader2 size={18} className="btn-spinner" /> : null}
                Yes, Delete My Account
              </button>
              <button
                className="modal-btn secondary"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword('');
                  setError('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Auth Modal for Login/Signup
const AuthModal = ({ onClose, onSuccess, showToast }) => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (mode === 'login') {
        result = await api.login(email, password);
      } else {
        result = await api.signup(email, password, name);
      }
      onSuccess(result.user);
      onClose();
      showToast(`Welcome, ${result.user.name}!`, 'success');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Log In
          </button>
          <button
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError(''); }}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          {mode === 'signup' && (
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min 6 characters' : 'Your password'}
                required
                minLength={mode === 'signup' ? 6 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="modal-btn primary auth-submit"
            disabled={loading}
          >
            {loading ? <Loader2 size={18} className="btn-spinner" /> : null}
            {mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          {mode === 'login' ? (
            <span>Don't have an account? <button onClick={() => setMode('signup')}>Sign up</button></span>
          ) : (
            <span>Already have an account? <button onClick={() => setMode('login')}>Log in</button></span>
          )}
        </div>
      </div>
    </div>
  );
};

const SaveMapForm = ({ projects, currentMap, rootUrl, onSave, onCreateProject, onCancel }) => {
  // Get default name from root domain (e.g., "example" from "https://www.example.com")
  const getDefaultName = () => {
    if (currentMap?.name) return currentMap.name;
    if (!rootUrl) return '';
    try {
      const hostname = new URL(rootUrl).hostname;
      // Remove www. prefix and get domain without TLD
      const parts = hostname.replace(/^www\./, '').split('.');
      // Return the main domain part (before TLD)
      return parts.length > 1 ? parts[parts.length - 2] : parts[0];
    } catch {
      return '';
    }
  };

  const [mapName, setMapName] = useState(getDefaultName());
  const [selectedProject, setSelectedProject] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const handleSave = () => {
    if (!mapName.trim()) return;
    onSave(selectedProject || null, mapName);
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName);
    setShowNewProject(false);
    setNewProjectName('');
  };

  return (
    <div className="save-map-form">
      <div className="form-group">
        <label>Map Name</label>
        <input
          type="text"
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
          placeholder="Enter map name..."
          autoFocus
        />
      </div>
      <div className="form-group">
        <label>Save to Project (optional)</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="">No project (Uncategorized)</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      {!showNewProject ? (
        <button className="new-project-link" onClick={() => setShowNewProject(true)}>
          <FolderPlus size={14} />
          Create new project
        </button>
      ) : (
        <div className="new-project-inline">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project name..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateProject();
              if (e.key === 'Escape') setShowNewProject(false);
            }}
          />
          <button onClick={handleCreateProject}>Create</button>
          <button className="cancel" onClick={() => setShowNewProject(false)}>Cancel</button>
        </div>
      )}
      <div className="form-actions">
        <button className="modal-btn" onClick={handleSave} disabled={!mapName.trim()}>
          Save Map
        </button>
        <button className="modal-btn cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default function App() {
  const [urlInput, setUrlInput] = useState('');
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [root, setRoot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [fullImageUrl, setFullImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [showColorKey, setShowColorKey] = useState(true);
  const [editingColorDepth, setEditingColorDepth] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [projects, setProjects] = useState([]); // Project folders
  const [currentMap, setCurrentMap] = useState(null); // Currently loaded map
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [showSaveMapModal, setShowSaveMapModal] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [shareEmails, setShareEmails] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanElapsed, setScanElapsed] = useState(0);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, queued: 0 });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState(new Set());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [, setAuthLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  // Undo/Redo history state
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);

  // Canvas tool state
  const [activeTool, setActiveTool] = useState('select'); // 'select', 'addNode', 'scissors', 'link', 'userflow'
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [viewSettings, setViewSettings] = useState({ userFlows: true, crosslinks: true });

  // User Flow & Crosslink connections
  const [userFlows, setUserFlows] = useState([]); // { id, from: nodeId, to: nodeId, color }
  const [crosslinks, setCrosslinks] = useState([]); // { id, from: nodeId, to: nodeId, color }
  const [connectionDraft, setConnectionDraft] = useState(null); // { from: nodeId, currentX, currentY, type: 'userflow' | 'crosslink' }

  // Drag & Drop state
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedNode: null,
    draggedNodeId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  const [dropIndicator, setDropIndicator] = useState(null);
  const [visibleDropZones, setVisibleDropZones] = useState([]); // All valid drop zones shown during drag
  const activeDropZoneRef = useRef(null);
  const dropZonesRef = useRef([]);

  const canvasRef = useRef(null);
  const scanAbortRef = useRef(null);
  const eventSourceRef = useRef(null);
  const scanTimerRef = useRef(null);
  const messageTimerRef = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });

  const hasMap = !!root;
  const maxDepth = useMemo(() => getMaxDepth(root), [root]);
  const totalNodes = useMemo(() => countNodes(root), [root]);

  // Calculate map bounds and clamp pan to limit scrolling
  const clampPan = (newPan) => {
    if (!contentRef.current || !canvasRef.current) return newPan;

    const cards = contentRef.current.querySelectorAll('[data-node-card="1"]');
    if (!cards.length) return newPan;

    const canvasRect = canvasRef.current.getBoundingClientRect();

    // Get the current bounds of all cards in screen coordinates
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      minX = Math.min(minX, rect.left - canvasRect.left);
      minY = Math.min(minY, rect.top - canvasRect.top);
      maxX = Math.max(maxX, rect.right - canvasRect.left);
      maxY = Math.max(maxY, rect.bottom - canvasRect.top);
    });

    // Calculate where the bounds would be with the new pan
    const dx = newPan.x - pan.x;
    const dy = newPan.y - pan.y;
    const newMinX = minX + dx;
    const newMinY = minY + dy;
    const newMaxX = maxX + dx;
    const newMaxY = maxY + dy;

    const padding = 240; // Max distance beyond map bounds
    let clampedX = newPan.x;
    let clampedY = newPan.y;

    // Right edge of map should not go more than padding pixels left of canvas left
    if (newMaxX < padding) {
      clampedX = newPan.x + (padding - newMaxX);
    }
    // Left edge of map should not go more than padding pixels right of canvas right
    if (newMinX > canvasRect.width - padding) {
      clampedX = newPan.x - (newMinX - (canvasRect.width - padding));
    }
    // Bottom edge of map should not go more than padding pixels above canvas top
    if (newMaxY < padding) {
      clampedY = newPan.y + (padding - newMaxY);
    }
    // Top edge of map should not go more than padding pixels below canvas bottom
    if (newMinY > canvasRect.height - padding) {
      clampedY = newPan.y - (newMinY - (canvasRect.height - padding));
    }

    return { x: clampedX, y: clampedY };
  };

  // Check auth and load data on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const initAuth = async () => {
      try {
        // Check if user is logged in via API
        const { user } = await api.getMe();
        if (user) {
          setCurrentUser(user);
          setIsLoggedIn(true);

          // Load user's projects, maps, and history from API
          try {
            const [projectsData, mapsData, historyData] = await Promise.all([
              api.getProjects(),
              api.getMaps(),
              api.getHistory(),
            ]);

            // Organize maps into projects
            const projectsWithMaps = (projectsData.projects || []).map(project => ({
              ...project,
              maps: (mapsData.maps || []).filter(m => m.project_id === project.id),
            }));

            // Add uncategorized maps (those without a project)
            const uncategorizedMaps = (mapsData.maps || []).filter(m => !m.project_id);
            if (uncategorizedMaps.length > 0) {
              const uncategorized = projectsWithMaps.find(p => p.name === 'Uncategorized');
              if (uncategorized) {
                uncategorized.maps = [...uncategorized.maps, ...uncategorizedMaps];
              } else {
                projectsWithMaps.push({
                  id: 'uncategorized',
                  name: 'Uncategorized',
                  maps: uncategorizedMaps,
                });
              }
            }

            setProjects(projectsWithMaps);
            setScanHistory(historyData.history || []);
          } catch (e) {
            console.error('Failed to load user data:', e);
          }
        }
      } catch (e) {
        // Not logged in or error - that's fine
        console.log('Not authenticated');
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();

    // Check for shared map in URL
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    if (shareId) {
      // Try to load from API first
      api.getShare(shareId)
        .then(({ share }) => {
          if (share?.root) {
            setRoot(share.root);
            if (share.colors) setColors(share.colors);
            setUrlInput(share.root.url || '');
            showToast('Shared map loaded!', 'success');
            window.history.replaceState({}, '', window.location.pathname);
            setTimeout(resetView, 100);
          }
        })
        .catch((e) => {
          // Fallback to localStorage for legacy shares
          const sharedData = localStorage.getItem(shareId);
          if (sharedData) {
            try {
              const { root: sharedRoot, colors: sharedColors } = JSON.parse(sharedData);
              if (sharedRoot) {
                setRoot(sharedRoot);
                if (sharedColors) setColors(sharedColors);
                setUrlInput(sharedRoot.url || '');
                showToast('Shared map loaded!', 'success');
                window.history.replaceState({}, '', window.location.pathname);
                setTimeout(resetView, 100);
              }
            } catch (parseError) {
              console.error('Failed to parse shared map:', parseError);
              showToast('Failed to load shared map', 'error');
            }
          } else {
            showToast(e.message || 'Shared map not found or expired', 'error');
          }
        });
    }
  }, []);

  const toastTimeoutRef = useRef(null);

  const showToast = (msg, type = 'info', persistent = false) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast({ message: msg, type, persistent });
    if (!persistent) {
      toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
    }
  };

  const dismissToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast(null);
  };

  const ToastIcon = ({ type }) => {
    switch (type) {
      case 'success': return <CheckCircle size={18} />;
      case 'error': return <XCircle size={18} />;
      case 'warning': return <AlertTriangle size={18} />;
      case 'loading': return <Loader2 size={18} className="toast-spinner" />;
      default: return <Info size={18} />;
    }
  };

  const handleLogin = () => {
    setShowAuthModal(true);
  };

  const handleAuthSuccess = async (user) => {
    setCurrentUser(user);
    setIsLoggedIn(true);

    // Load user's projects, maps, and history
    try {
      const [projectsData, mapsData, historyData] = await Promise.all([
        api.getProjects(),
        api.getMaps(),
        api.getHistory(),
      ]);

      // Organize maps into projects
      const projectsWithMaps = (projectsData.projects || []).map(project => ({
        ...project,
        maps: (mapsData.maps || []).filter(m => m.project_id === project.id),
      }));

      // Add uncategorized maps (those without a project)
      const uncategorizedMaps = (mapsData.maps || []).filter(m => !m.project_id);
      if (uncategorizedMaps.length > 0) {
        const uncategorized = projectsWithMaps.find(p => p.name === 'Uncategorized');
        if (uncategorized) {
          uncategorized.maps = [...uncategorized.maps, ...uncategorizedMaps];
        } else {
          projectsWithMaps.push({
            id: 'uncategorized',
            name: 'Uncategorized',
            maps: uncategorizedMaps,
          });
        }
      }

      setProjects(projectsWithMaps);
      setScanHistory(historyData.history || []);
    } catch (e) {
      console.error('Failed to load user data:', e);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    setCurrentUser(null);
    setIsLoggedIn(false);
    setProjects([]);
    setScanHistory([]);
    setCurrentMap(null);
    showToast('Logged out', 'info');
  };

  // Fetch full page screenshot from backend
  const viewFullScreenshot = async (pageUrl) => {
    setImageLoading(true);
    setFullImageUrl(null);
    showToast('Loading full page screenshot...', 'loading', true);

    try {
      const res = await fetch(
        `${API_BASE}/screenshot?url=${encodeURIComponent(pageUrl)}&type=full`
      );
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.url) {
        setFullImageUrl(data.url);
        setToast(null); // Clear the loading toast
      } else {
        throw new Error('No screenshot URL returned');
      }
    } catch (e) {
      console.error('Screenshot error:', e);
      showToast(`Screenshot failed: ${e.message}`, 'error');
      setImageLoading(false);
    }
  };

  // Project folder functions
  const createProject = async (name) => {
    if (!name?.trim()) return;
    try {
      const { project } = await api.createProject(name.trim());
      setProjects(prev => [...prev, { ...project, maps: [] }]);
      showToast(`Project "${name}" created`, 'success');
      return project;
    } catch (e) {
      showToast(e.message || 'Failed to create project', 'error');
      return null;
    }
  };

  const renameProject = async (projectId, newName) => {
    if (!newName?.trim()) return;
    try {
      const { project } = await api.updateProject(projectId, newName.trim());
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, name: project.name } : p
      ));
      setEditingProjectId(null);
      showToast('Project renamed', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to rename project', 'error');
    }
  };

  const deleteProject = async (projectId) => {
    if (!window.confirm('Delete this project and all its maps?')) return;
    try {
      await api.deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      showToast('Project deleted', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete project', 'error');
    }
  };

  // Map functions
  const saveMap = async (projectId, mapName) => {
    if (!root) return showToast('No sitemap to save', 'warning');
    if (!mapName?.trim()) return;

    try {
      let savedMap;
      if (currentMap?.id) {
        // Update existing map
        const { map } = await api.updateMap(currentMap.id, {
          name: mapName.trim(),
          root,
          colors,
          project_id: projectId || null,
        });
        savedMap = map;
      } else {
        // Create new map
        const { map } = await api.saveMap({
          name: mapName.trim(),
          url: root.url,
          root,
          colors,
          project_id: projectId || null,
        });
        savedMap = map;
      }

      // Update local projects list
      setProjects(prev => {
        // Remove from old project if exists
        let updated = prev.map(p => ({
          ...p,
          maps: (p.maps || []).filter(m => m.id !== savedMap.id),
        }));

        // Add to new project
        if (projectId) {
          updated = updated.map(p =>
            p.id === projectId
              ? { ...p, maps: [...(p.maps || []), savedMap] }
              : p
          );
        }
        return updated;
      });

      setCurrentMap(savedMap);
      setShowSaveMapModal(false);
      showToast(`Map "${mapName}" saved`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to save map', 'error');
    }
  };

  const loadMap = (map) => {
    setRoot(map.root);
    setColors(map.colors || DEFAULT_COLORS);
    setCurrentMap(map);
    setShowProjectsModal(false);
    setScale(1);
    setPan({ x: 0, y: 0 });
    setUrlInput(map.root?.url || '');
    showToast(`Loaded "${map.name}"`, 'success');
    setTimeout(resetView, 100);
  };

  const deleteMap = async (projectId, mapId) => {
    if (!window.confirm('Delete this map?')) return;
    try {
      await api.deleteMap(mapId);
      setProjects(prev => prev.map(p => {
        if (p.id !== projectId) return p;
        return { ...p, maps: (p.maps || []).filter(m => m.id !== mapId) };
      }));
      if (currentMap?.id === mapId) setCurrentMap(null);
      showToast('Map deleted', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete map', 'error');
    }
  };

  const toggleProjectExpanded = (projectId) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  // History functions
  const addToHistory = async (url, rootData, pageCount) => {
    if (!isLoggedIn) return; // Only save history for logged-in users

    try {
      const { id } = await api.addToHistory({
        url,
        hostname: getHostname(url),
        title: rootData?.title || getHostname(url),
        page_count: pageCount,
        root: rootData,
        colors,
      });

      // Add to local state
      const historyItem = {
        id,
        url,
        hostname: getHostname(url),
        title: rootData?.title || getHostname(url),
        page_count: pageCount,
        scanned_at: new Date().toISOString(),
        root: rootData,
        colors,
      };

      setScanHistory(prev => [historyItem, ...prev].slice(0, 50));
    } catch (e) {
      console.error('Failed to save to history:', e);
    }
  };

  const loadFromHistory = (historyItem) => {
    setRoot(historyItem.root);
    setColors(historyItem.colors || DEFAULT_COLORS);
    setCurrentMap(null);
    setUrlInput(historyItem.url);
    setShowHistoryModal(false);
    setSelectedHistoryItems(new Set());
    setScale(1);
    setPan({ x: 0, y: 0 });
    showToast(`Loaded "${historyItem.hostname}"`, 'success');
    setTimeout(resetView, 100);
  };

  const toggleHistorySelection = (id) => {
    setSelectedHistoryItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllHistory = () => {
    setSelectedHistoryItems(new Set(scanHistory.map(h => h.id)));
  };

  const clearHistorySelection = () => {
    setSelectedHistoryItems(new Set());
  };

  const deleteSelectedHistory = async () => {
    if (selectedHistoryItems.size === 0) return;
    if (!window.confirm(`Delete ${selectedHistoryItems.size} scan${selectedHistoryItems.size > 1 ? 's' : ''} from history?`)) return;

    try {
      await api.deleteHistory(Array.from(selectedHistoryItems));
      setScanHistory(prev => prev.filter(h => !selectedHistoryItems.has(h.id)));
      const count = selectedHistoryItems.size;
      setSelectedHistoryItems(new Set());
      showToast(`Deleted ${count} scan${count > 1 ? 's' : ''}`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete history', 'error');
    }
  };

  const startScanTimers = () => {
    setScanElapsed(0);
    setScanMessage(SCAN_MESSAGES[0]);
    let elapsed = 0;
    let msgIndex = 0;

    scanTimerRef.current = setInterval(() => {
      elapsed += 1;
      setScanElapsed(elapsed);
    }, 1000);

    messageTimerRef.current = setInterval(() => {
      msgIndex = (msgIndex + 1) % SCAN_MESSAGES.length;
      setScanMessage(SCAN_MESSAGES[msgIndex]);
    }, 3000);
  };

  const stopScanTimers = () => {
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    if (messageTimerRef.current) clearInterval(messageTimerRef.current);
    scanTimerRef.current = null;
    messageTimerRef.current = null;
  };

  const cancelScan = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (scanAbortRef.current) {
      scanAbortRef.current.abort();
    }
    stopScanTimers();
    setLoading(false);
    setShowCancelConfirm(false);
    setScanProgress({ scanned: 0, queued: 0 });
    showToast('Scan cancelled', 'info');
  };

  const scan = () => {
    const url = sanitizeUrl(urlInput);
    if (!url) {
      showToast('Please enter a valid URL', 'warning');
      return;
    }

    setLoading(true);
    setScanProgress({ scanned: 0, queued: 0 });
    startScanTimers();

    // Use SSE for progress updates
    const eventSource = new EventSource(
      `${API_BASE}/scan-stream?url=${encodeURIComponent(url)}`
    );
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        setScanProgress(data);
      } catch {}
    });

    eventSource.addEventListener('complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        setRoot(data.root);
        setCurrentMap(null);
        setScale(1);
        setPan({ x: 0, y: 0 });
        const pageCount = countNodes(data.root);
        addToHistory(url, data.root, pageCount);
        showToast(`Scan complete: ${new URL(url).hostname}`, 'success');
        setTimeout(resetView, 100);
      } catch {}
      eventSource.close();
      eventSourceRef.current = null;
      stopScanTimers();
      setLoading(false);
      setScanProgress({ scanned: 0, queued: 0 });
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse(e.data);
        showToast(`Scan failed: ${data.error}`, 'error');
      } catch {
        showToast('Scan failed: Connection error', 'error');
      }
      eventSource.close();
      eventSourceRef.current = null;
      stopScanTimers();
      setLoading(false);
      setScanProgress({ scanned: 0, queued: 0 });
    });

    eventSource.onerror = () => {
      showToast('Scan failed: Connection error');
      eventSource.close();
      eventSourceRef.current = null;
      stopScanTimers();
      setLoading(false);
      setScanProgress({ scanned: 0, queued: 0 });
    };
  };

  const onKeyDownUrl = (e) => {
    if (e.key === 'Enter') scan();
  };

  const onPointerDown = (e) => {
    if (!hasMap) return;
    if (e.button !== 0) return;
    const isInsideCard = e.target.closest('[data-node-card="1"]');
    const isUIControl = e.target.closest('.zoom-controls, .color-key, .color-key-toggle, .canvas-toolbar');
    if (isInsideCard || isUIControl) return;

    // Cancel connection draft if clicking on empty canvas
    if (connectionDraft) {
      cancelConnection();
      return;
    }

    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.startPanX = pan.x;
    dragRef.current.startPanY = pan.y;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    // Handle connection draft
    if (connectionDraft) {
      updateConnectionDraft(e.clientX, e.clientY);
      return;
    }
    // Handle node dragging
    if (dragState.isDragging) {
      handleDragMove(e);
      return;
    }
    // Handle canvas panning
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newPan = { x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy };
    setPan(clampPan(newPan));
  };

  const onPointerUp = (e) => {
    // Handle node drag end
    if (dragState.isDragging) {
      handleDragEnd();
      return;
    }
    // Handle canvas pan end
    dragRef.current.dragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const onWheel = (e) => {
    if (!hasMap) return;

    // Pinch zoom (Ctrl/Cmd + scroll)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();

      const delta = -e.deltaY;
      const zoomIntensity = 0.002;
      const next = clamp(scale * (1 + delta * zoomIntensity), 0.1, 3);

      const rect = canvasRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const ox = (cx - pan.x) / scale;
      const oy = (cy - pan.y) / scale;

      const nx = cx - ox * next;
      const ny = cy - oy * next;

      setScale(next);
      // Note: clampPan is called on next frame after scale updates
      requestAnimationFrame(() => setPan(p => clampPan(p)));
      setPan({ x: nx, y: ny });
      return;
    }

    // Two-finger scroll pans (trackpad)
    e.preventDefault();
    setPan((p) => clampPan({
      x: p.x - e.deltaX,
      y: p.y - e.deltaY,
    }));
  };

  const zoomIn = () => setScale((s) => clamp(s * 1.2, 0.1, 3));
  const zoomOut = () => setScale((s) => clamp(s / 1.2, 0.1, 3));

  const resetView = () => {
    // Reset to 100% scale with Home page centered at top of viewport
    if (!contentRef.current || !canvasRef.current) {
      setScale(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    // First reset to default state
    setScale(1);
    setPan({ x: 0, y: 0 });

    // Wait for render, then center on root node
    setTimeout(() => {
      if (!contentRef.current || !canvasRef.current) return;

      const rootNode = contentRef.current.querySelector('[data-depth="0"]');
      if (!rootNode) return;

      const canvasRect = canvasRef.current.getBoundingClientRect();
      const nodeCard = rootNode.querySelector('[data-node-card="1"]');
      const nodeRect = nodeCard ? nodeCard.getBoundingClientRect() : rootNode.getBoundingClientRect();

      // Calculate pan to center the home page horizontally and position it near top
      // Node position relative to canvas
      const nodeX = nodeRect.left - canvasRect.left + nodeRect.width / 2;
      const nodeY = nodeRect.top - canvasRect.top;

      // Target: center horizontally, 60px from top
      const targetX = canvasRect.width / 2;
      const targetY = 60;

      const newPanX = targetX - nodeX;
      const newPanY = targetY - nodeY;

      setPan({ x: newPanX, y: newPanY });
    }, 50);
  };

  const fitToScreen = () => {
    if (!contentRef.current || !canvasRef.current) return;

    // Reset first to measure at scale 1
    setScale(1);
    setPan({ x: 0, y: 0 });

    // Wait for render
    setTimeout(() => {
      if (!contentRef.current || !canvasRef.current) return;

      const cards = contentRef.current.querySelectorAll('[data-node-card="1"]');
      if (!cards.length) return;

      const canvasRect = canvasRef.current.getBoundingClientRect();

      // Find bounds of all cards in canvas coordinates
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        minX = Math.min(minX, rect.left - canvasRect.left);
        minY = Math.min(minY, rect.top - canvasRect.top);
        maxX = Math.max(maxX, rect.right - canvasRect.left);
        maxY = Math.max(maxY, rect.bottom - canvasRect.top);
      });

      // Include connectors in bounds
      const svgs = contentRef.current.querySelectorAll('.connector-svg');
      svgs.forEach(svg => {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          minX = Math.min(minX, rect.left - canvasRect.left);
          minY = Math.min(minY, rect.top - canvasRect.top);
          maxX = Math.max(maxX, rect.right - canvasRect.left);
          maxY = Math.max(maxY, rect.bottom - canvasRect.top);
        }
      });

      const mapWidth = maxX - minX;
      const mapHeight = maxY - minY;
      const mapCenterX = (minX + maxX) / 2;
      const mapCenterY = (minY + maxY) / 2;

      const padding = 80;
      const availableWidth = canvasRect.width - padding * 2;
      const availableHeight = canvasRect.height - padding * 2;

      // Calculate scale to fit
      const scaleX = availableWidth / mapWidth;
      const scaleY = availableHeight / mapHeight;
      const newScale = clamp(Math.min(scaleX, scaleY), 0.05, 1);

      // Calculate pan to center the map
      // At scale 1, pan 0, the map center is at (mapCenterX, mapCenterY)
      // After scaling by newScale, it will be at a different position
      // We need to pan so the scaled map is centered in the canvas

      const canvasCenterX = canvasRect.width / 2;
      const canvasCenterY = canvasRect.height / 2;

      // The map will scale around the content origin (canvas center horizontally due to left:50%)
      // New map center relative position = (mapCenterX - canvasCenterX) * newScale + canvasCenterX
      // We want this to equal canvasCenterX, so:
      // panX = canvasCenterX - ((mapCenterX - canvasCenterX) * newScale + canvasCenterX)
      //      = -(mapCenterX - canvasCenterX) * newScale
      //      = (canvasCenterX - mapCenterX) * newScale
      // But actually simpler: just move the current map center to canvas center, accounting for scale

      const newPanX = (canvasCenterX - mapCenterX);
      const newPanY = (canvasCenterY - mapCenterY);

      setScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    }, 50);
  };

  const exportJson = () => {
    if (!root) return;
    downloadText('sitemap.json', JSON.stringify({ root, colors }, null, 2));
    showToast('Exported JSON');
  };

  const exportCsv = () => {
    if (!root) return;

    // Flatten tree to array with all node data
    const rows = [];
    const flattenWithNumber = (node, depth = 0, number = '1') => {
      rows.push({
        number,
        depth,
        title: (node.title || '').replace(/"/g, '""'),
        url: node.url || '',
        hasChildren: node.children?.length > 0 ? 'Yes' : 'No',
        childCount: node.children?.length || 0,
      });
      (node.children || []).forEach((child, idx) => {
        flattenWithNumber(child, depth + 1, `${number}.${idx + 1}`);
      });
    };

    flattenWithNumber(root, 0, '1');

    // Create CSV content
    const headers = ['Page Number', 'Depth Level', 'Page Title', 'URL', 'Has Children', 'Child Count'];
    const csvRows = [
      headers.join(','),
      ...rows.map(row => [
        `"${row.number}"`,
        row.depth,
        `"${row.title}"`,
        `"${row.url}"`,
        row.hasChildren,
        row.childCount,
      ].join(','))
    ];

    downloadText('sitemap.csv', csvRows.join('\n'));
    showToast('Exported CSV');
  };

  const exportPdf = async () => {
    if (!hasMap || !contentRef.current || !canvasRef.current) return;

    // Save current transform state
    const savedScale = scale;
    const savedPan = { ...pan };

    showToast('Generating PDF...', 'info', true);

    try {
      // Dynamically import dependencies
      const [{ jsPDF }, { toSvg }] = await Promise.all([
        import('jspdf'),
        import('html-to-image'),
      ]);

      // Reset to 1:1 scale for accurate capture
      setScale(1);
      setPan({ x: 0, y: 0 });
      await new Promise(r => setTimeout(r, 200));

      // Capture visual map using same approach as PNG export
      const content = contentRef.current;
      const canvas = canvasRef.current;
      const canvasRect = canvas.getBoundingClientRect();
      const cards = content.querySelectorAll('[data-node-card="1"]');

      if (!cards.length) {
        setScale(savedScale);
        setPan(savedPan);
        showToast('No content to export', 'warning');
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        minX = Math.min(minX, rect.left - canvasRect.left);
        minY = Math.min(minY, rect.top - canvasRect.top);
        maxX = Math.max(maxX, rect.right - canvasRect.left);
        maxY = Math.max(maxY, rect.bottom - canvasRect.top);
      });

      // Include connector SVGs in bounds
      const svgs = content.querySelectorAll('.connector-svg');
      svgs.forEach(svg => {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          minX = Math.min(minX, rect.left - canvasRect.left);
          minY = Math.min(minY, rect.top - canvasRect.top);
          maxX = Math.max(maxX, rect.right - canvasRect.left);
          maxY = Math.max(maxY, rect.bottom - canvasRect.top);
        }
      });

      const padding = 60;
      const imgWidth = Math.ceil(maxX - minX + padding * 2);
      const imgHeight = Math.ceil(maxY - minY + padding * 2);

      // Position the content so the map is centered with equal padding
      const offsetX = -minX + padding;
      const offsetY = -minY + padding - 80;
      setPan({ x: offsetX, y: offsetY });

      // Hide grid dots for export
      content.classList.add('export-mode');

      await new Promise(r => setTimeout(r, 200));

      // Capture as SVG for vector quality
      const svgDataUrl = await toSvg(canvas, {
        cacheBust: true,
        backgroundColor: null,
        width: imgWidth,
        height: imgHeight,
        skipFonts: true,
        style: {
          width: `${imgWidth}px`,
          height: `${imgHeight}px`,
          backgroundColor: 'transparent',
        },
        filter: (node) => {
          if (node.classList?.contains('zoom-controls')) return false;
          if (node.classList?.contains('color-key')) return false;
          // Exclude cross-origin thumbnail images
          if (node.tagName === 'IMG' && node.classList?.contains('thumb-img')) return false;
          return true;
        },
      });

      // Restore grid dots and transform state
      content.classList.remove('export-mode');
      setScale(savedScale);
      setPan(savedPan);

      // Determine PDF orientation based on aspect ratio
      const isLandscape = imgWidth > imgHeight;
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      // Convert pixels to mm (96 DPI)
      const pxToMm = 25.4 / 96;
      const imgWidthMm = imgWidth * pxToMm;
      const imgHeightMm = imgHeight * pxToMm;

      // Scale to fit page with margins
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const scaleX = availableWidth / imgWidthMm;
      const scaleY = availableHeight / imgHeightMm;
      const imgScale = Math.min(scaleX, scaleY, 1);

      const finalWidth = imgWidthMm * imgScale;
      const finalHeight = imgHeightMm * imgScale;

      // Center the image
      const xOffset = (pageWidth - finalWidth) / 2;
      const yOffset = (pageHeight - finalHeight) / 2;

      // Add SVG as image (jsPDF supports SVG data URLs)
      pdf.addImage(svgDataUrl, 'SVG', xOffset, yOffset, finalWidth, finalHeight);

      const hostname = getHostname(root.url) || 'export';
      pdf.save(`sitemap-${hostname}.pdf`);
      showToast('PDF exported successfully', 'success');
    } catch (e) {
      console.error('PDF export error:', e);
      const errorMsg = e?.message || e?.toString() || 'Unknown error';
      showToast(`PDF export failed: ${errorMsg}`, 'error');
      // Restore grid and transform state on error
      if (contentRef.current) contentRef.current.classList.remove('export-mode');
      setScale(savedScale);
      setPan(savedPan);
    }
  };

  const exportSiteIndex = () => {
    if (!root) return;

    const hostname = getHostname(root.url) || 'sitemap';

    // Build page list
    const rows = [];
    const flattenForDoc = (node, number = '1', depth = 0) => {
      const indent = '    '.repeat(depth);
      rows.push({
        number,
        title: node.title || 'Untitled',
        url: node.url || '',
        indent,
        depth,
      });
      (node.children || []).forEach((child, idx) => {
        flattenForDoc(child, `${number}.${idx + 1}`, depth + 1);
      });
    };
    flattenForDoc(root);

    // Create HTML content that Word/Google Docs/TextEdit can open
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Site Index - ${hostname}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #6366f1; margin-bottom: 5px; }
    .subtitle { color: #64748b; margin-bottom: 30px; }
    .meta { color: #94a3b8; font-size: 12px; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f1f5f9; text-align: left; padding: 10px; font-size: 12px; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .num { color: #94a3b8; font-size: 12px; white-space: nowrap; }
    .title { color: #1e293b; }
    .url { color: #6366f1; font-size: 12px; word-break: break-all; }
    .indent-1 { padding-left: 20px; }
    .indent-2 { padding-left: 40px; }
    .indent-3 { padding-left: 60px; }
    .indent-4 { padding-left: 80px; }
    .indent-5 { padding-left: 100px; }
  </style>
</head>
<body>
  <h1>Site Index</h1>
  <p class="subtitle">${hostname}</p>
  <p class="meta">Root URL: ${root.url}<br>Total Pages: ${totalNodes}<br>Generated: ${new Date().toLocaleString()}</p>

  <table>
    <thead>
      <tr>
        <th style="width: 60px;">#</th>
        <th>Page Title</th>
        <th style="width: 40%;">URL</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => `
        <tr>
          <td class="num">${row.number}</td>
          <td class="title indent-${Math.min(row.depth, 5)}">${row.title}</td>
          <td class="url">${row.url}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
    `.trim();

    // Download as .doc (HTML format is compatible with Word)
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `site-index-${hostname}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Delay URL revocation to allow download to start
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    showToast('Site Index exported', 'success');
  };

  const copyShareLink = async () => {
    try {
      // Create share via API
      const { share } = await api.createShare({
        map_id: currentMap?.id || null,
        root,
        colors,
        expires_in_days: 30, // Share links expire in 30 days
      });

      // Create shareable URL
      const shareUrl = `${window.location.origin}?share=${share.id}`;

      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      showToast('Link copied to clipboard', 'success');
    } catch (e) {
      // If not logged in, fall back to localStorage
      if (e.message?.includes('Authentication')) {
        const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const shareData = { root, colors, createdAt: Date.now() };
        localStorage.setItem(shareId, JSON.stringify(shareData));
        const shareUrl = `${window.location.origin}?share=${shareId}`;
        await navigator.clipboard.writeText(shareUrl);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        showToast('Link copied (temporary - log in for persistent links)', 'success');
      } else {
        showToast(e.message || 'Failed to create share link', 'error');
      }
    }
  };

  const sendShareEmail = () => {
    if (!shareEmails.trim()) {
      showToast('Please enter email addresses');
      return;
    }
    const subject = encodeURIComponent('Check out this sitemap');
    const body = encodeURIComponent(`I wanted to share this sitemap with you.\n\nView it here: ${window.location.origin}`);
    window.open(`mailto:${shareEmails}?subject=${subject}&body=${body}`);
    showToast('Email client opened');
    setShowShareModal(false);
    setShareEmails('');
  };

  const exportPng = async () => {
    if (!hasMap || !contentRef.current || !canvasRef.current) return;

    // Save current transform state
    const savedScale = scale;
    const savedPan = { ...pan };

    try {
      showToast('Generating PNG...', 'info', true);

      // Reset to 1:1 scale for accurate capture
      setScale(1);
      setPan({ x: 0, y: 0 });

      // Wait for React to re-render
      await new Promise(r => setTimeout(r, 200));

      const { toPng } = await import('html-to-image');

      const content = contentRef.current;
      const canvas = canvasRef.current;
      const canvasRect = canvas.getBoundingClientRect();

      // Find bounds of all cards
      const cards = content.querySelectorAll('[data-node-card="1"]');
      if (!cards.length) {
        setScale(savedScale);
        setPan(savedPan);
        showToast('No content to export', 'warning');
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        minX = Math.min(minX, rect.left - canvasRect.left);
        minY = Math.min(minY, rect.top - canvasRect.top);
        maxX = Math.max(maxX, rect.right - canvasRect.left);
        maxY = Math.max(maxY, rect.bottom - canvasRect.top);
      });

      // Include connector SVGs in bounds
      const svgs = content.querySelectorAll('.connector-svg');
      svgs.forEach(svg => {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          minX = Math.min(minX, rect.left - canvasRect.left);
          minY = Math.min(minY, rect.top - canvasRect.top);
          maxX = Math.max(maxX, rect.right - canvasRect.left);
          maxY = Math.max(maxY, rect.bottom - canvasRect.top);
        }
      });

      const padding = 60;
      const exportWidth = Math.ceil(maxX - minX + padding * 2);
      const exportHeight = Math.ceil(maxY - minY + padding * 2);

      // Position the content so the map is centered with equal padding on all sides
      const offsetX = -minX + padding;
      const offsetY = -minY + padding - 80; // -80 to account for content top: 80px in CSS
      setPan({ x: offsetX, y: offsetY });

      // Hide grid dots for export
      content.style.setProperty('--export-mode', '1');
      content.classList.add('export-mode');

      await new Promise(r => setTimeout(r, 200));

      // Capture the canvas element directly with transparent background
      const dataUrl = await toPng(canvas, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: null, // Transparent background
        width: exportWidth,
        height: exportHeight,
        skipFonts: true,
        style: {
          width: `${exportWidth}px`,
          height: `${exportHeight}px`,
          backgroundColor: 'transparent',
        },
        filter: (node) => {
          // Exclude zoom controls, color key, and grid from export
          if (node.classList?.contains('zoom-controls')) return false;
          if (node.classList?.contains('color-key')) return false;
          // Exclude cross-origin thumbnail images
          if (node.tagName === 'IMG' && node.classList?.contains('thumb-img')) return false;
          return true;
        },
      });

      // Restore grid dots
      content.classList.remove('export-mode');

      // Download
      const link = document.createElement('a');
      link.download = `sitemap-${getHostname(root.url) || 'export'}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      showToast('PNG exported successfully', 'success');
    } catch (e) {
      console.error('PNG export error:', e);
      const errorMsg = e?.message || e?.toString() || 'Unknown error';
      showToast(`PNG export failed: ${errorMsg}`, 'error');
      // Restore grid dots on error
      if (contentRef.current) contentRef.current.classList.remove('export-mode');
    } finally {
      // Restore original transform state
      setScale(savedScale);
      setPan(savedPan);
    }
  };

  // ========== UNDO/REDO SYSTEM ==========

  const pushToHistory = useCallback((newRoot) => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    if (!newRoot) return;

    setHistory(prev => {
      // Remove any future states if we're not at the end
      const newHistory = prev.slice(0, historyIndex + 1);
      // Add the new state
      newHistory.push(structuredClone(newRoot));
      // Limit history to 50 entries
      if (newHistory.length > 50) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    isUndoRedoAction.current = true;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setRoot(structuredClone(history[newIndex]));
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    isUndoRedoAction.current = true;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setRoot(structuredClone(history[newIndex]));
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Track root changes for undo history
  useEffect(() => {
    if (root && !isUndoRedoAction.current) {
      pushToHistory(root);
    }
  }, [root, pushToHistory]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Cmd+Z (Mac) or Ctrl+Z (Windows)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      // Also support Cmd+Y / Ctrl+Y for redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // ========== USER FLOW & CROSSLINK CONNECTIONS ==========

  const generateConnectionId = () => `conn_${Math.random().toString(36).slice(2, 10)}`;

  const getNodeCenter = useCallback((nodeId) => {
    if (!contentRef.current) return null;
    const card = contentRef.current.querySelector(`[data-node-id="${nodeId}"]`);
    if (!card) return null;
    const rect = card.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, []);

  const startConnection = useCallback((nodeId, type) => {
    const center = getNodeCenter(nodeId);
    if (!center) return;
    setConnectionDraft({
      from: nodeId,
      currentX: center.x,
      currentY: center.y,
      type, // 'userflow' or 'crosslink'
    });
  }, [getNodeCenter]);

  const updateConnectionDraft = useCallback((clientX, clientY) => {
    if (!connectionDraft) return;
    setConnectionDraft(prev => ({
      ...prev,
      currentX: clientX,
      currentY: clientY,
    }));
  }, [connectionDraft]);

  const completeConnection = useCallback((toNodeId) => {
    if (!connectionDraft || connectionDraft.from === toNodeId) {
      setConnectionDraft(null);
      return;
    }

    const newConnection = {
      id: generateConnectionId(),
      from: connectionDraft.from,
      to: toNodeId,
      color: connectionDraft.type === 'userflow' ? '#f59e0b' : '#06b6d4', // amber for userflow, cyan for crosslink
    };

    if (connectionDraft.type === 'userflow') {
      setUserFlows(prev => [...prev, newConnection]);
    } else {
      setCrosslinks(prev => [...prev, newConnection]);
    }

    setConnectionDraft(null);
    setActiveTool('select');
  }, [connectionDraft]);

  const cancelConnection = useCallback(() => {
    setConnectionDraft(null);
  }, []);

  const deleteConnection = useCallback((connectionId, type) => {
    if (type === 'userflow') {
      setUserFlows(prev => prev.filter(c => c.id !== connectionId));
    } else {
      setCrosslinks(prev => prev.filter(c => c.id !== connectionId));
    }
  }, []);

  // Handle node click for connection tools
  const handleNodeClickForConnection = useCallback((nodeId) => {
    if (activeTool !== 'userflow' && activeTool !== 'link') return false;

    if (!connectionDraft) {
      // Start new connection
      startConnection(nodeId, activeTool === 'userflow' ? 'userflow' : 'crosslink');
    } else {
      // Complete connection
      completeConnection(nodeId);
    }
    return true; // Handled
  }, [activeTool, connectionDraft, startConnection, completeConnection]);

  const findNodeById = (node, id) => {
    if (!node) return null;
    if (node.id === id) return node;
    for (const c of node.children || []) {
      const f = findNodeById(c, id);
      if (f) return f;
    }
    return null;
  };

  const addChild = (parentId) => {
    setRoot((prev) => {
      const copy = structuredClone(prev);
      const parent = findNodeById(copy, parentId);
      if (!parent) return prev;
      parent.children = parent.children || [];
      const newNode = {
        id: `manual_${Math.random().toString(36).slice(2, 10)}`,
        title: 'New Page',
        url: 'https://example.com/new',
        children: [],
      };
      parent.children.push(newNode);
      return copy;
    });
  };

  const deleteNode = (id) => {
    if (!root) return;
    if (root.id === id) return;

    const remove = (node) => {
      if (!node.children) return;
      node.children = node.children.filter((c) => c.id !== id);
      node.children.forEach(remove);
    };

    setRoot((prev) => {
      const copy = structuredClone(prev);
      remove(copy);
      return copy;
    });
  };

  const editNode = (node) => {
    const title = window.prompt('Edit page title:', node.title || '');
    if (title == null) return;

    setRoot((prev) => {
      const copy = structuredClone(prev);
      const target = findNodeById(copy, node.id);
      if (!target) return prev;
      target.title = title;
      return copy;
    });
  };

  // ========== DRAG & DROP ==========

  const findParent = (tree, nodeId, parent = null) => {
    if (!tree) return null;
    if (tree.id === nodeId) return parent;
    for (const child of tree.children || []) {
      const found = findParent(child, nodeId, tree);
      if (found) return found;
    }
    return null;
  };

  const isDescendantOf = (tree, nodeId, ancestorId) => {
    const ancestor = findNodeById(tree, ancestorId);
    if (!ancestor) return false;
    return !!findNodeById(ancestor, nodeId);
  };

  const moveNode = (nodeId, newParentId, insertIndex) => {
    if (!root || nodeId === root.id) return;
    if (nodeId === newParentId) return;
    if (isDescendantOf(root, newParentId, nodeId)) return;

    setRoot((prev) => {
      const copy = structuredClone(prev);
      const nodeToMove = findNodeById(copy, nodeId);
      if (!nodeToMove) return prev;

      const oldParent = findParent(copy, nodeId);
      if (!oldParent) return prev;

      const oldIndex = oldParent.children.findIndex(c => c.id === nodeId);
      if (oldIndex === -1) return prev;

      oldParent.children.splice(oldIndex, 1);

      const newParent = findNodeById(copy, newParentId);
      if (!newParent) return prev;

      newParent.children = newParent.children || [];

      let adjustedIndex = insertIndex;
      if (oldParent.id === newParentId && oldIndex < insertIndex) {
        adjustedIndex = insertIndex - 1;
      }

      newParent.children.splice(adjustedIndex, 0, nodeToMove);
      return copy;
    });
  };

  const calculateDropZones = () => {
    if (!contentRef.current || !root) return [];
    const zones = [];
    const cards = contentRef.current.querySelectorAll('[data-node-card="1"]');

    cards.forEach((card) => {
      const nodeId = card.getAttribute('data-node-id');
      if (!nodeId) return;

      const rect = card.getBoundingClientRect();
      const node = findNodeById(root, nodeId);
      if (!node) return;

      const parent = findParent(root, nodeId);
      if (!parent) return;

      const siblingIndex = parent.children.findIndex(c => c.id === nodeId);
      const parentWrap = card.closest('.parent-wrap');
      const depth = parseInt(parentWrap?.getAttribute('data-depth') || '0', 10);

      if (depth === 0) {
        zones.push({
          type: 'sibling',
          parentId: parent.id,
          index: siblingIndex,
          rect: { left: rect.left - 40, top: rect.top, width: 40, height: rect.height },
        });
        if (siblingIndex === parent.children.length - 1) {
          zones.push({
            type: 'sibling',
            parentId: parent.id,
            index: siblingIndex + 1,
            rect: { left: rect.right, top: rect.top, width: 40, height: rect.height },
          });
        }
      } else {
        zones.push({
          type: 'sibling',
          parentId: parent.id,
          index: siblingIndex,
          rect: { left: rect.left, top: rect.top - 40, width: rect.width, height: 40 },
        });
        if (siblingIndex === parent.children.length - 1) {
          zones.push({
            type: 'sibling',
            parentId: parent.id,
            index: siblingIndex + 1,
            rect: { left: rect.left, top: rect.bottom, width: rect.width, height: 40 },
          });
        }
      }

      if (!node.children?.length) {
        zones.push({
          type: 'child',
          parentId: nodeId,
          index: 0,
          rect: { left: rect.left, top: rect.bottom + 40, width: rect.width, height: rect.height },
        });
      }
    });

    return zones;
  };

  const findNearestDropZone = (x, y, threshold = 60) => {
    const zones = dropZonesRef.current;
    let nearest = null;
    let nearestDist = Infinity;

    for (const zone of zones) {
      if (dragState.draggedNodeId === zone.parentId) continue;
      if (zone.type === 'sibling') {
        const parent = findNodeById(root, zone.parentId);
        if (parent?.children?.[zone.index]?.id === dragState.draggedNodeId) continue;
        if (zone.index > 0 && parent?.children?.[zone.index - 1]?.id === dragState.draggedNodeId) continue;
      }
      if (isDescendantOf(root, zone.parentId, dragState.draggedNodeId)) continue;

      const r = zone.rect;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const inZone = x >= r.left - threshold && x <= r.left + r.width + threshold &&
                     y >= r.top - threshold && y <= r.top + r.height + threshold;

      if (inZone && dist < nearestDist) {
        nearestDist = dist;
        nearest = zone;
      }
    }

    return nearest;
  };

  const handleNodeDragStart = (node, e) => {
    if (!node || node.id === root?.id) return;
    const allZones = calculateDropZones();

    // Filter out invalid drop zones for this node
    const validZones = allZones.filter(zone => {
      // Can't drop on self
      if (zone.parentId === node.id) return false;
      // Can't drop on descendants
      if (isDescendantOf(root, zone.parentId, node.id)) return false;
      // Filter out positions that would result in no change
      if (zone.type === 'sibling') {
        const parent = findNodeById(root, zone.parentId);
        if (parent?.children?.[zone.index]?.id === node.id) return false;
        if (zone.index > 0 && parent?.children?.[zone.index - 1]?.id === node.id) return false;
      }
      return true;
    });

    dropZonesRef.current = validZones;
    // Don't show all zones - only show nearest when in proximity
    setVisibleDropZones([]);

    setDragState({
      isDragging: true,
      draggedNode: node,
      draggedNodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    });
  };

  const handleDragMove = (e) => {
    if (!dragState.isDragging) return;

    setDragState(prev => ({
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY,
    }));

    const nearest = findNearestDropZone(e.clientX, e.clientY);

    if (activeDropZoneRef.current && !nearest) {
      const current = activeDropZoneRef.current;
      const stillNear = findNearestDropZone(e.clientX, e.clientY, 80);
      if (stillNear?.parentId === current.parentId && stillNear?.index === current.index && stillNear?.type === current.type) {
        return;
      }
    }

    activeDropZoneRef.current = nearest;
    setDropIndicator(nearest ? { type: nearest.type, parentId: nearest.parentId, index: nearest.index } : null);
    // Only show the nearest zone as a visual indicator (proximity-based)
    setVisibleDropZones(nearest ? [nearest] : []);
  };

  const handleDragEnd = () => {
    if (!dragState.isDragging) return;

    if (dropIndicator && dragState.draggedNodeId) {
      if (dropIndicator.type === 'sibling') {
        moveNode(dragState.draggedNodeId, dropIndicator.parentId, dropIndicator.index);
      } else if (dropIndicator.type === 'child') {
        moveNode(dragState.draggedNodeId, dropIndicator.parentId, 0);
      }
    }

    setDragState({
      isDragging: false,
      draggedNode: null,
      draggedNodeId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    });
    setDropIndicator(null);
    setVisibleDropZones([]);
    activeDropZoneRef.current = null;
    dropZonesRef.current = [];
  };

  const updateLevelColor = (depth, color) => {
    const newColors = [...colors];
    newColors[depth] = color;
    setColors(newColors);
    setEditingColorDepth(null);
  };
// File import parsing functions
  const generateId = () => `import_${Math.random().toString(36).slice(2, 10)}`;

  const parseXmlSitemap = (text) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const urls = [];

    // Check for parse errors - if XML is invalid, fall back to regex
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.error('XML parse error, using regex fallback');
      const urlRegex = /https?:\/\/[^\s<>"']+/gi;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        urls.push(match[0]);
      }
      return [...new Set(urls)];
    }

    // Use getElementsByTagName which ignores namespaces
    const locElements = doc.getElementsByTagName('loc');

    for (let i = 0; i < locElements.length; i++) {
      const url = locElements[i].textContent?.trim();
      if (url) {
        urls.push(url);
      }
    }

    // If no loc elements, try to find any URLs in the text
    if (urls.length === 0) {
      const urlRegex = /https?:\/\/[^\s<>"']+/gi;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        urls.push(match[0]);
      }
    }

    return [...new Set(urls)];
  };

  const parseRssAtom = (text) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const urls = [];

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.error('XML parse error:', parseError.textContent);
      return urls;
    }

    // RSS format - use getElementsByTagName for namespace compatibility
    const items = doc.getElementsByTagName('item');
    for (let i = 0; i < items.length; i++) {
      const link = items[i].getElementsByTagName('link')[0];
      if (link?.textContent?.trim()) {
        urls.push(link.textContent.trim());
      }
    }

    // Atom format
    const entries = doc.getElementsByTagName('entry');
    for (let i = 0; i < entries.length; i++) {
      const links = entries[i].getElementsByTagName('link');
      for (let j = 0; j < links.length; j++) {
        const href = links[j].getAttribute('href');
        if (href && href.startsWith('http')) {
          urls.push(href);
        }
      }
    }

    // Also check for channel link in RSS
    const channelLinks = doc.getElementsByTagName('link');
    for (let i = 0; i < channelLinks.length; i++) {
      const url = channelLinks[i].textContent?.trim();
      if (url && url.startsWith('http') && !urls.includes(url)) {
        urls.push(url);
      }
    }

    return [...new Set(urls)];
  };

  const parseHtml = (text, baseUrl = '') => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const urls = [];

    doc.querySelectorAll('a[href]').forEach(a => {
      let href = a.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
        try {
          // Try to resolve relative URLs
          if (baseUrl && !href.startsWith('http')) {
            href = new URL(href, baseUrl).href;
          }
          if (href.startsWith('http')) {
            urls.push(href);
          }
        } catch {
          // Skip invalid URLs
        }
      }
    });

    return [...new Set(urls)];
  };

  const parseCsv = (text) => {
    const urls = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Split by common delimiters
      const parts = line.split(/[,;\t]+/);
      for (const part of parts) {
        const trimmed = part.trim().replace(/^["']|["']$/g, '');
        if (trimmed.match(/^https?:\/\//i)) {
          urls.push(trimmed);
        }
      }
    }

    return urls;
  };

  const parseMarkdown = (text) => {
    const urls = [];

    // Markdown links: [text](url)
    const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = mdLinkRegex.exec(text)) !== null) {
      if (match[2].match(/^https?:\/\//i)) {
        urls.push(match[2]);
      }
    }

    // Plain URLs
    const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
    while ((match = urlRegex.exec(text)) !== null) {
      urls.push(match[0]);
    }

    return [...new Set(urls)];
  };

  const parsePlainText = (text) => {
    const urls = [];
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      urls.push(match[0]);
    }
    return [...new Set(urls)];
  };

  const buildTreeFromUrls = (urls) => {
    if (!urls.length) return null;

    // Group URLs by domain
    const byDomain = {};
    for (const url of urls) {
      try {
        const u = new URL(url);
        const domain = u.hostname;
        if (!byDomain[domain]) byDomain[domain] = [];
        byDomain[domain].push(url);
      } catch {
        // Skip invalid URLs
      }
    }

    const domains = Object.keys(byDomain);

    // If only one domain, build hierarchical tree
    if (domains.length === 1) {
      const domain = domains[0];
      const domainUrls = byDomain[domain];

      // Find the root URL (shortest path or homepage)
      const sorted = [...domainUrls].sort((a, b) => {
        const pathA = new URL(a).pathname;
        const pathB = new URL(b).pathname;
        return pathA.length - pathB.length;
      });

      const rootUrl = sorted[0];
      const root = {
        id: generateId(),
        title: domain,
        url: rootUrl,
        children: []
      };

      // Build tree based on URL paths
      const urlMap = new Map();
      urlMap.set(rootUrl, root);

      for (const url of sorted.slice(1)) {
        try {
          const u = new URL(url);
          const pathParts = u.pathname.split('/').filter(Boolean);
          const title = pathParts[pathParts.length - 1] || u.pathname || 'Page';

          const node = {
            id: generateId(),
            title: decodeURIComponent(title).replace(/[-_]/g, ' '),
            url: url,
            children: []
          };

          // Find parent by matching path
          let parent = root;
          let parentPath = '';
          for (let i = 0; i < pathParts.length - 1; i++) {
            parentPath += '/' + pathParts[i];
            const parentUrl = `${u.origin}${parentPath}`;
            if (urlMap.has(parentUrl)) {
              parent = urlMap.get(parentUrl);
            }
          }

          parent.children.push(node);
          urlMap.set(url, node);
        } catch {
          // Skip invalid URLs
        }
      }

      return root;
    }

    // Multiple domains: create a root with domain children
    const root = {
      id: generateId(),
      title: 'Imported Sites',
      url: urls[0],
      children: []
    };

    for (const domain of domains) {
      const domainUrls = byDomain[domain];
      const domainNode = {
        id: generateId(),
        title: domain,
        url: domainUrls[0],
        children: domainUrls.slice(1).map(url => ({
          id: generateId(),
          title: new URL(url).pathname || 'Page',
          url: url,
          children: []
        }))
      };
      root.children.push(domainNode);
    }

    return root;
  };

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);

    try {
      const text = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let urls = [];
      let parseType = '';

      if (ext === 'xml') {
        // Could be sitemap or RSS/Atom
        if (text.includes('<rss') || text.includes('<feed')) {
          urls = parseRssAtom(text);
          parseType = 'RSS/Atom';
        } else {
          urls = parseXmlSitemap(text);
          parseType = 'XML Sitemap';
        }
      } else if (ext === 'rss' || ext === 'atom') {
        urls = parseRssAtom(text);
        parseType = 'RSS/Atom';
      } else if (ext === 'html' || ext === 'htm') {
        urls = parseHtml(text);
        parseType = 'HTML';
      } else if (ext === 'csv') {
        urls = parseCsv(text);
        parseType = 'CSV';
      } else if (ext === 'md' || ext === 'markdown') {
        urls = parseMarkdown(text);
        parseType = 'Markdown';
      } else {
        urls = parsePlainText(text);
        parseType = 'Text';
      }

      console.log(`Parsed ${parseType}: found ${urls.length} URLs`);

      if (urls.length === 0) {
        showToast(`No URLs found in ${parseType} file`, 'error');
        setImportLoading(false);
        e.target.value = '';
        return;
      }

      const tree = buildTreeFromUrls(urls);
      if (tree) {
        setRoot(tree);
        setCurrentMap(null);
        setScale(1);
        setPan({ x: 0, y: 0 });
        setUrlInput(tree.url || '');
        setShowImportModal(false);
        showToast(`Imported ${urls.length} URLs from ${parseType}`, 'success');
      } else {
        showToast('Could not build sitemap from URLs', 'error');
      }
    } catch (err) {
      console.error('Import error:', err);
      showToast(`Import failed: ${err.message || 'Unknown error'}`, 'error');
    }

    setImportLoading(false);
    e.target.value = ''; // Reset input
  };

  // Show landing page or app
  if (showLanding) {
    return <LandingPage onLaunchApp={() => setShowLanding(false)} />;
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <div className="brand">Map Mat</div>
        </div>

        <div className="topbar-center">
          <div className="search-container">
            <Scan size={18} className="search-icon" />
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={onKeyDownUrl}
              onFocus={(e) => { if (!urlInput) e.target.placeholder = ''; }}
              onBlur={(e) => { if (!urlInput) e.target.placeholder = 'https://example.com'; }}
              placeholder="https://example.com"
              spellCheck={false}
            />

            {hasMap && (
              <button
                className="clear-btn"
                onClick={() => {
                  if (window.confirm('Clear the canvas?')) {
                    setRoot(null);
                    setCurrentMap(null);
                    setScale(1);
                    setPan({ x: 0, y: 0 });
                    setUrlInput('');
                  }
                }}
                title="Clear canvas"
              >
                <X size={14} />
                Clear
              </button>
            )}

            <div className={`thumb-toggle ${showThumbnails ? 'active' : ''}`} onClick={() => setShowThumbnails(v => !v)}>
              <span>Thumbnails</span>
              <div className="toggle-switch" />
            </div>

            <button className="scan-btn" onClick={scan} disabled={loading}>
              Scan
            </button>
          </div>
        </div>

        <div className="topbar-right">
          <button
            className="icon-btn"
            title="Import File"
            onClick={() => setShowImportModal(true)}
          >
            <Upload size={18} />
          </button>

          <button
            className="icon-btn"
            title="Save Map"
            onClick={() => setShowSaveMapModal(true)}
            disabled={!hasMap}
          >
            <Bookmark size={18} />
          </button>

          <button
            className="icon-btn"
            title="Projects"
            onClick={() => setShowProjectsModal(true)}
          >
            <Folder size={18} />
          </button>

          {isLoggedIn && (
            <button
              className="icon-btn"
              title="Scan History"
              onClick={() => setShowHistoryModal(true)}
            >
              <History size={18} />
            </button>
          )}

          <div className="divider" />

          <button
            className="icon-btn"
            title="Export"
            onClick={() => setShowExportModal(true)}
            disabled={!hasMap}
          >
            <Download size={18} />
          </button>

          <button
            className="icon-btn"
            title="Share"
            onClick={() => setShowShareModal(true)}
            disabled={!hasMap}
          >
            <Share2 size={18} />
          </button>

          <div className="divider" />

          {isLoggedIn ? (
            <>
              <button
                className="user-btn"
                onClick={() => setShowProfileModal(true)}
                title="Account Settings"
              >
                <User size={16} />
                <span>{currentUser?.name}</span>
              </button>
              <button className="icon-btn" title="Logout" onClick={handleLogout}>
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <button className="icon-btn primary" title="Login" onClick={handleLogin}>
              <LogIn size={18} />
            </button>
          )}
        </div>
      </div>

      <div
        className="canvas"
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        {!hasMap && (
          <div className="blank">
            <div className="blank-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div className="blank-title">Ready to Map</div>
            <div className="blank-subtitle">Enter a URL above to get started</div>
          </div>
        )}

        {hasMap && (
          <>
            <div
              className="content"
              ref={contentRef}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale}) translate(-50%, 0px)`,
              }}
            >
              <SitemapTree
                data={root}
                showThumbnails={showThumbnails}
                colors={colors}
                scale={scale}
                onAdd={addChild}
                onDelete={deleteNode}
                onEdit={editNode}
                onViewImage={viewFullScreenshot}
                onDragStart={handleNodeDragStart}
                draggedNodeId={dragState.draggedNodeId}
                dropIndicator={dropIndicator}
                onNodeClick={handleNodeClickForConnection}
                isConnectionMode={activeTool === 'userflow' || activeTool === 'link'}
                onNodeDoubleClick={(id) => {
                  if (scale < 0.95) {
                    const el = contentRef.current?.querySelector(`[data-node-id="${id}"]`);
                    if (el) {
                      const rect = el.getBoundingClientRect();
                      const canvasRect = canvasRef.current.getBoundingClientRect();
                      const dx = canvasRect.left + canvasRect.width / 2 - (rect.left + rect.width / 2);
                      const dy = canvasRect.top + canvasRect.height / 2 - (rect.top + rect.height / 2);
                      setScale(1);
                      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
                    }
                  }
                }}
              />
            </div>

            {/* Connection Lines SVG Overlay */}
            <svg className="connections-svg">
              <defs>
                {/* Arrow marker for user flow lines */}
                <marker
                  id="userflow-arrow"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,6 L9,3 z" fill="#f59e0b" />
                </marker>
              </defs>

              {/* User Flow lines (solid with arrow) */}
              {viewSettings.userFlows && userFlows.map(flow => {
                const fromCenter = getNodeCenter(flow.from);
                const toCenter = getNodeCenter(flow.to);
                if (!fromCenter || !toCenter) return null;

                return (
                  <line
                    key={flow.id}
                    x1={fromCenter.x}
                    y1={fromCenter.y}
                    x2={toCenter.x}
                    y2={toCenter.y}
                    stroke={flow.color}
                    strokeWidth="3"
                    markerEnd="url(#userflow-arrow)"
                    className="connection-line userflow"
                  />
                );
              })}

              {/* Crosslink lines (dashed, no arrow) */}
              {viewSettings.crosslinks && crosslinks.map(link => {
                const fromCenter = getNodeCenter(link.from);
                const toCenter = getNodeCenter(link.to);
                if (!fromCenter || !toCenter) return null;

                return (
                  <line
                    key={link.id}
                    x1={fromCenter.x}
                    y1={fromCenter.y}
                    x2={toCenter.x}
                    y2={toCenter.y}
                    stroke={link.color}
                    strokeWidth="2"
                    strokeDasharray="8,4"
                    className="connection-line crosslink"
                  />
                );
              })}

              {/* Draft connection line while drawing */}
              {connectionDraft && (() => {
                const fromCenter = getNodeCenter(connectionDraft.from);
                if (!fromCenter) return null;

                return (
                  <line
                    x1={fromCenter.x}
                    y1={fromCenter.y}
                    x2={connectionDraft.currentX}
                    y2={connectionDraft.currentY}
                    stroke={connectionDraft.type === 'userflow' ? '#f59e0b' : '#06b6d4'}
                    strokeWidth={connectionDraft.type === 'userflow' ? 3 : 2}
                    strokeDasharray={connectionDraft.type === 'userflow' ? 'none' : '8,4'}
                    markerEnd={connectionDraft.type === 'userflow' ? 'url(#userflow-arrow)' : 'none'}
                    className="connection-line draft"
                    opacity="0.7"
                  />
                );
              })()}
            </svg>

            <div className="color-key">
              <div className="color-key-header" onClick={() => setShowColorKey(v => !v)}>
                <div className="color-key-title">
                  <Palette size={16} />
                  <span>Colors</span>
                </div>
                <button className="key-toggle">
                  {showColorKey ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>
              {showColorKey && (
                <div className="color-key-list">
                  {colors.slice(0, maxDepth + 1).map((color, idx) => (
                    <div key={idx} className="color-key-item" onClick={() => setEditingColorDepth(idx)}>
                      <div className="color-swatch" style={{ backgroundColor: color }} />
                      <span>Level {idx}</span>
                      <Edit2 size={12} className="color-edit-icon" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="zoom-controls">
              <button className="zoom-btn" onClick={zoomOut} title="Zoom Out">
                <ZoomOut size={18} />
              </button>
              <span className="zoom-level">{Math.round(scale * 100)}%</span>
              <button className="zoom-btn" onClick={zoomIn} title="Zoom In">
                <ZoomIn size={18} />
              </button>
              <button className="zoom-btn" onClick={fitToScreen} title="Fit to Screen">
                <Minimize2 size={18} />
              </button>
              <button className="zoom-btn" onClick={resetView} title="Reset View (100%)">
                <Maximize2 size={18} />
              </button>
            </div>

            {/* Canvas Toolbar */}
            <div className="canvas-toolbar">
              {/* Select & Add */}
              <button
                className={`canvas-tool-btn ${activeTool === 'select' ? 'active' : ''}`}
                onClick={() => setActiveTool('select')}
                title="Select (V)"
              >
                <MousePointer2 size={20} />
              </button>
              <button
                className={`canvas-tool-btn ${activeTool === 'addNode' ? 'active' : ''}`}
                onClick={() => setActiveTool('addNode')}
                title="Add Page"
              >
                <Plus size={20} />
              </button>

              <div className="canvas-toolbar-divider" />

              {/* Connection Tools */}
              <button
                className={`canvas-tool-btn ${activeTool === 'userflow' ? 'active' : ''}`}
                onClick={() => setActiveTool('userflow')}
                title="Create User Flow"
              >
                <Workflow size={20} />
              </button>
              <button
                className={`canvas-tool-btn ${activeTool === 'link' ? 'active' : ''}`}
                onClick={() => setActiveTool('link')}
                title="Create Crosslink"
              >
                <Link size={20} />
              </button>

              <div className="canvas-toolbar-divider" />

              {/* Undo/Redo */}
              <button
                className={`canvas-tool-btn ${!canUndo ? 'disabled' : ''}`}
                onClick={undo}
                disabled={!canUndo}
                title="Undo (⌘Z)"
              >
                <Undo2 size={20} />
              </button>
              <button
                className={`canvas-tool-btn ${!canRedo ? 'disabled' : ''}`}
                onClick={redo}
                disabled={!canRedo}
                title="Redo (⇧⌘Z)"
              >
                <Redo2 size={20} />
              </button>

              <div className="canvas-toolbar-divider" />

              {/* View Menu */}
              <div className="view-menu-container">
                <button
                  className={`canvas-tool-btn ${showViewMenu ? 'active' : ''}`}
                  onClick={() => setShowViewMenu(!showViewMenu)}
                  title="View Options"
                >
                  <EyeIcon size={20} />
                </button>
                {showViewMenu && (
                  <div className="view-menu-dropdown">
                    <label className="view-menu-item">
                      <input
                        type="checkbox"
                        checked={viewSettings.userFlows}
                        onChange={(e) => setViewSettings(prev => ({ ...prev, userFlows: e.target.checked }))}
                      />
                      <Workflow size={16} />
                      <span>User Flows</span>
                    </label>
                    <label className="view-menu-item">
                      <input
                        type="checkbox"
                        checked={viewSettings.crosslinks}
                        onChange={(e) => setViewSettings(prev => ({ ...prev, crosslinks: e.target.checked }))}
                      />
                      <Link size={16} />
                      <span>Crosslinks</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Floating drag card */}
        {dragState.isDragging && dragState.draggedNode && (
          <div
            className="floating-drag-card"
            style={{
              left: dragState.currentX,
              top: dragState.currentY,
            }}
          >
            <div className="floating-card-inner">
              <GripVertical size={14} className="drag-handle" />
              <span className="floating-card-title">{dragState.draggedNode.title || 'Untitled'}</span>
            </div>
          </div>
        )}

        {/* Drop zone indicators - proximity-based, only shows nearest valid position */}
        {dragState.isDragging && visibleDropZones.map((zone, idx) => {
          const isActive = dropIndicator &&
            dropIndicator.parentId === zone.parentId &&
            dropIndicator.index === zone.index &&
            dropIndicator.type === zone.type;

          // For sibling zones, render as thin line
          // For child zones, render as small card-shaped placeholder
          const isSibling = zone.type === 'sibling';
          const isHorizontal = zone.rect.width > zone.rect.height;

          let style;
          if (isSibling) {
            // Thin line indicator - 4px thick
            if (isHorizontal) {
              // Horizontal sibling (vertical line)
              style = {
                left: zone.rect.left + zone.rect.width / 2 - 2,
                top: zone.rect.top,
                width: 4,
                height: zone.rect.height,
              };
            } else {
              // Vertical sibling (horizontal line)
              style = {
                left: zone.rect.left,
                top: zone.rect.top + zone.rect.height / 2 - 2,
                width: zone.rect.width,
                height: 4,
              };
            }
          } else {
            // Child zone - show as dashed rectangle
            style = {
              left: zone.rect.left,
              top: zone.rect.top,
              width: zone.rect.width,
              height: Math.min(zone.rect.height, 80), // Cap height for child indicator
            };
          }

          return (
            <div
              key={`dropzone-${idx}`}
              className={`drop-zone-indicator ${zone.type} ${isActive ? 'active' : ''}`}
              style={style}
            />
          );
        })}

      </div>

      {editingColorDepth !== null && (
        <div className="modal-overlay" onClick={() => setEditingColorDepth(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Level {editingColorDepth} Color</h3>
            <input
              type="color"
              value={colors[editingColorDepth]}
              onChange={(e) => updateLevelColor(editingColorDepth, e.target.value)}
              style={{ width: '100%', height: 60, border: 'none', cursor: 'pointer' }}
            />
            <button className="modal-btn" onClick={() => setEditingColorDepth(null)}>Done</button>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-card export-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowExportModal(false)}>
              <X size={18} />
            </button>
            <h3>Download</h3>
            <div className="export-options">
              <button className="export-btn" onClick={() => { setShowExportModal(false); exportPng(); }}>
                <FileImage size={24} />
                <div className="export-btn-text">
                  <span className="export-btn-title">PNG Image</span>
                  <span className="export-btn-desc">Visual sitemap for presentations</span>
                </div>
              </button>
              <button className="export-btn" onClick={() => { setShowExportModal(false); exportPdf(); }}>
                <FileText size={24} />
                <div className="export-btn-text">
                  <span className="export-btn-title">PDF Document</span>
                  <span className="export-btn-desc">Printable report with page list</span>
                </div>
              </button>
              <button className="export-btn" onClick={() => { exportCsv(); setShowExportModal(false); }}>
                <FileSpreadsheet size={24} />
                <div className="export-btn-text">
                  <span className="export-btn-title">CSV Spreadsheet</span>
                  <span className="export-btn-desc">Page data for Excel or Google Sheets</span>
                </div>
              </button>
              <button className="export-btn" onClick={() => { exportJson(); setShowExportModal(false); }}>
                <FileJson size={24} />
                <div className="export-btn-text">
                  <span className="export-btn-title">JSON Data</span>
                  <span className="export-btn-desc">Raw data for import or backup</span>
                </div>
              </button>
              <button className="export-btn" onClick={() => { exportSiteIndex(); setShowExportModal(false); }}>
                <List size={24} />
                <div className="export-btn-text">
                  <span className="export-btn-title">Site Index</span>
                  <span className="export-btn-desc">Page list document for Word or Google Docs</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="modal-overlay" onClick={() => { setShowShareModal(false); setShareEmails(''); setLinkCopied(false); }}>
          <div className="modal-card share-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowShareModal(false); setShareEmails(''); setLinkCopied(false); }}>
              <X size={18} />
            </button>
            <h3>Share Sitemap</h3>

            <div className="share-section">
              <button className={`share-link-btn ${linkCopied ? 'copied' : ''}`} onClick={copyShareLink}>
                {linkCopied ? <Check size={18} /> : <Copy size={18} />}
                <span>{linkCopied ? 'Link Copied!' : 'Copy Share Link'}</span>
              </button>
            </div>

            <div className="share-section">
              <div className="share-section-title">Send via Email</div>
              <div className="share-email-section">
                <div className="share-email-input">
                  <Mail size={18} />
                  <input
                    type="text"
                    placeholder="Enter email addresses..."
                    value={shareEmails}
                    onChange={(e) => setShareEmails(e.target.value)}
                  />
                </div>
                <button className="share-email-btn" onClick={sendShareEmail}>
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSaveMapModal && (
        <div className="modal-overlay" onClick={() => setShowSaveMapModal(false)}>
          <div className="modal-card save-map-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSaveMapModal(false)}>
              <X size={18} />
            </button>
            <h3>Save Map</h3>
            {!isLoggedIn ? (
              <div className="projects-empty">
                Please log in to save maps
              </div>
            ) : (
              <SaveMapForm
                projects={projects}
                currentMap={currentMap}
                rootUrl={root?.url}
                onSave={saveMap}
                onCreateProject={createProject}
                onCancel={() => setShowSaveMapModal(false)}
              />
            )}
          </div>
        </div>
      )}

      {showProjectsModal && (
        <div className="modal-overlay" onClick={() => { setShowProjectsModal(false); setEditingProjectId(null); }}>
          <div className="modal-card projects-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowProjectsModal(false); setEditingProjectId(null); }}>
              <X size={18} />
            </button>
            <h3>Projects & Maps</h3>
            {!isLoggedIn ? (
              <div className="projects-empty">
                Please log in to save and manage projects
              </div>
            ) : (
              <>
                <div className="projects-list">
                  {projects.length === 0 ? (
                    <div className="projects-empty">
                      No projects yet. Create one to organize your maps.
                    </div>
                  ) : (
                    projects.map(project => (
                      <div key={project.id} className="project-folder">
                        <div className="project-folder-header" onClick={() => toggleProjectExpanded(project.id)}>
                          <div className="project-folder-icon">
                            <Folder size={18} />
                          </div>
                          {editingProjectId === project.id ? (
                            <input
                              className="project-name-input"
                              value={editingProjectName}
                              onChange={(e) => setEditingProjectName(e.target.value)}
                              onBlur={() => renameProject(project.id, editingProjectName)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') renameProject(project.id, editingProjectName);
                                if (e.key === 'Escape') setEditingProjectId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          ) : (
                            <span className="project-folder-name">{project.name}</span>
                          )}
                          <span className="project-map-count">{project.maps?.length || 0} maps</span>
                          <div className="project-chevron">
                            {expandedProjects[project.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                          <div className="project-folder-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="project-action-btn"
                              title="Rename"
                              onClick={() => { setEditingProjectId(project.id); setEditingProjectName(project.name); }}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="project-action-btn danger"
                              title="Delete Project"
                              onClick={() => deleteProject(project.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {expandedProjects[project.id] && (
                          <div className="project-maps">
                            {project.maps?.length === 0 ? (
                              <div className="project-maps-empty">No maps in this project</div>
                            ) : (
                              project.maps?.map(map => (
                                <div key={map.id} className="map-item" onClick={() => loadMap(map)}>
                                  <Map size={16} />
                                  <span className="map-name">{map.name}</span>
                                  <span className="map-date">{new Date(map.updatedAt).toLocaleDateString()}</span>
                                  <button
                                    className="map-delete"
                                    title="Delete Map"
                                    onClick={(e) => { e.stopPropagation(); deleteMap(project.id, map.id); }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <button
                  className="add-project-btn"
                  onClick={() => {
                    const name = window.prompt('New project name:');
                    if (name) createProject(name);
                  }}
                >
                  <FolderPlus size={18} />
                  Add Project
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => { setShowHistoryModal(false); setSelectedHistoryItems(new Set()); }}>
          <div className="modal-card history-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowHistoryModal(false); setSelectedHistoryItems(new Set()); }}>
              <X size={18} />
            </button>
            <h3>Scan History</h3>
            {scanHistory.length === 0 ? (
              <div className="history-empty">
                No scans in history yet. Your completed scans will appear here.
              </div>
            ) : (
              <>
                <div className="history-actions">
                  <button
                    className="history-action-btn"
                    onClick={selectedHistoryItems.size === scanHistory.length ? clearHistorySelection : selectAllHistory}
                  >
                    {selectedHistoryItems.size === scanHistory.length ? (
                      <><CheckSquare size={16} /> Deselect All</>
                    ) : (
                      <><Square size={16} /> Select All</>
                    )}
                  </button>
                  {selectedHistoryItems.size > 0 && (
                    <button className="history-action-btn danger" onClick={deleteSelectedHistory}>
                      <Trash2 size={16} />
                      Delete Selected ({selectedHistoryItems.size})
                    </button>
                  )}
                </div>
                <div className="history-list">
                  {scanHistory.map(item => (
                    <div
                      key={item.id}
                      className={`history-item ${selectedHistoryItems.has(item.id) ? 'selected' : ''}`}
                    >
                      <button
                        className="history-checkbox"
                        onClick={(e) => { e.stopPropagation(); toggleHistorySelection(item.id); }}
                      >
                        {selectedHistoryItems.has(item.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                      <div className="history-item-content" onClick={() => loadFromHistory(item)}>
                        <div className="history-item-header">
                          <Globe size={16} />
                          <span className="history-hostname">{item.hostname}</span>
                          <span className="history-pages">{item.page_count || item.pageCount} pages</span>
                        </div>
                        <div className="history-item-meta">
                          <span className="history-url">{item.url}</span>
                          <span className="history-date">{new Date(item.scanned_at || item.scannedAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="modal-overlay scanning-overlay">
          <div className="modal-card scanning-modal" onClick={(e) => e.stopPropagation()}>
            {!showCancelConfirm ? (
              <>
                <div className="scan-animation">
                  <Globe size={48} className="scan-globe" />
                  <Loader2 size={80} className="scan-spinner" />
                </div>
                <div className="scan-status">
                  <div className="scan-message">{scanMessage}</div>
                  <div className="scan-stats">
                    <div className="scan-pages">
                      <span className="scan-pages-count">{scanProgress.scanned}</span>
                      <span className="scan-pages-label">pages scanned</span>
                    </div>
                    {scanProgress.queued > 0 && (
                      <div className="scan-queued">
                        <span className="scan-queued-count">{scanProgress.queued}</span>
                        <span className="scan-queued-label">in queue</span>
                      </div>
                    )}
                  </div>
                  <div className="scan-time-info">
                    <div className="scan-elapsed">
                      <span className="scan-time-label">Elapsed</span>
                      <span className="scan-time-value">
                        {Math.floor(scanElapsed / 60)}:{String(scanElapsed % 60).padStart(2, '0')}
                      </span>
                    </div>
                    {scanProgress.scanned > 2 && scanProgress.queued > 0 && (
                      <div className="scan-estimated">
                        <span className="scan-time-label">Est. remaining</span>
                        <span className="scan-time-value">
                          {(() => {
                            const avgTimePerPage = scanElapsed / scanProgress.scanned;
                            const estRemaining = Math.ceil(avgTimePerPage * scanProgress.queued);
                            const mins = Math.floor(estRemaining / 60);
                            const secs = estRemaining % 60;
                            return `~${mins}:${String(secs).padStart(2, '0')}`;
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="scan-url">{urlInput}</div>
                <button
                  className="modal-btn cancel"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  Cancel Scan
                </button>
              </>
            ) : (
              <>
                <div className="cancel-confirm">
                  <AlertTriangle size={48} className="cancel-warning-icon" />
                  <h3>Cancel Scan?</h3>
                  <p>Are you sure you want to cancel the current scan?</p>
                </div>
                <div className="cancel-actions">
                  <button className="modal-btn danger" onClick={cancelScan}>
                    Yes, Cancel Scan
                  </button>
                  <button
                    className="modal-btn secondary"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    No, Continue Scanning
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {fullImageUrl && (
        <div
          className="modal-overlay image-overlay"
          onClick={() => { setFullImageUrl(null); setImageLoading(false); }}
          onKeyDown={(e) => e.key === 'Escape' && (setFullImageUrl(null), setImageLoading(false))}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          <div className="image-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setFullImageUrl(null); setImageLoading(false); }}>
              <X size={18} />
            </button>
            {imageLoading && (
              <div className="image-loading-overlay">
                <Loader2 size={48} className="image-spinner" />
                <span>Loading screenshot...</span>
              </div>
            )}
            <img
              key={fullImageUrl}
              src={fullImageUrl}
              alt="Full page view"
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                showToast('Failed to load screenshot', 'error');
                setFullImageUrl(null);
              }}
              style={{ opacity: imageLoading ? 0 : 1 }}
            />
          </div>
        </div>
      )}

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
          showToast={showToast}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfileModal(false)}
          onUpdate={(updatedUser) => setCurrentUser(updatedUser)}
          onLogout={handleLogout}
          showToast={showToast}
        />
      )}

      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal import-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Import Sitemap</h2>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="import-info">
                <p>Import a sitemap from a file. Supported formats:</p>
                <ul className="import-formats">
                  <li><strong>XML</strong> - Standard sitemap.xml files</li>
                  <li><strong>RSS/Atom</strong> - Feed files with links</li>
                  <li><strong>HTML</strong> - Extracts all links from the page</li>
                  <li><strong>CSV</strong> - Comma-separated URLs</li>
                  <li><strong>Markdown</strong> - Extracts URLs from markdown</li>
                  <li><strong>TXT</strong> - Plain text with URLs</li>
                </ul>
              </div>
              <label className="import-dropzone">
                <input
                  type="file"
                  accept=".xml,.rss,.atom,.html,.htm,.csv,.md,.markdown,.txt"
                  onChange={handleFileImport}
                  disabled={importLoading}
                />
                {importLoading ? (
                  <div className="import-loading">
                    <Loader2 size={32} className="spin" />
                    <span>Processing file...</span>
                  </div>
                ) : (
                  <>
                    <FileUp size={48} />
                    <span>Click to select file or drag and drop</span>
                    <span className="import-hint">.xml, .rss, .atom, .html, .csv, .md, .txt</span>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <ToastIcon type={toast.type} />
          <span>{toast.message}</span>
          <button className="toast-close" onClick={dismissToast}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}