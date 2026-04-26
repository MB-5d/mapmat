import React, { useCallback, useDeferredValue, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  PanelRightOpen,
  Search,
  Shield,
  ShieldAlert,
  User,
  UserCheck,
  UserX,
} from 'lucide-react';

import './AdminConsole.css';
import AccountDrawer from '../drawers/AccountDrawer';
import Avatar from '../ui/Avatar';
import FeedbackConsole from './FeedbackConsole';
import {
  adminDisableUser,
  adminReactivateUser,
  adminResetUserPassword,
  createAdminSession,
  destroyAdminSession,
  getAdminSession,
  getAdminUser,
  getAdminUsers,
} from '../../api';
import { ENABLE_ADMIN_CONSOLE } from '../../utils/constants';
import { createAdminHomeRoute, createAdminUserRoute } from '../../utils/appRoutes';

const DEFAULT_SORT_BY = 'updatedAt';
const DEFAULT_SORT_DIRECTION = 'desc';

const SORTABLE_COLUMNS = Object.freeze([
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'accountStatus', label: 'Status' },
  { key: 'updatedAt', label: 'Updated' },
]);

function getDefaultSortDirection(sortBy) {
  return sortBy === 'createdAt' || sortBy === 'updatedAt' ? 'desc' : 'asc';
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatTableTimestamp(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAdminRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'platform_owner') return 'Platform owner';
  if (normalized === 'support') return 'Support';
  return 'Admin';
}

function SortIcon({ active, direction }) {
  if (!active) return <ChevronsUpDown size={14} />;
  return direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
}

function AdminUserDrawer({
  isOpen,
  user,
  loading,
  error,
  actionLoading,
  actionError,
  actionMessage,
  newPassword,
  disableReason,
  onNewPasswordChange,
  onDisableReasonChange,
  onPasswordReset,
  onDisableUser,
  onReactivateUser,
  onClose,
}) {
  return (
    <AccountDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={user?.name || 'User Support'}
      subtitle={user?.email || 'Support details'}
      icon={<Shield size={18} />}
      className="admin-console-drawer"
    >
      {loading ? (
        <div className="admin-console-empty admin-console-drawer-state">
          <Loader2 size={16} className="admin-console-spinner" />
          <span>Loading user details…</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="admin-console-error admin-console-drawer-state">{error}</div>
      ) : null}

      {!loading && !error && user ? (
        <>
          <div className="account-hero admin-console-drawer-hero">
            <Avatar
              className="account-hero-avatar account-hero-avatar-image admin-console-drawer-avatar"
              src={user.avatarUrl}
              label={String(user.name || 'A').trim().charAt(0).toUpperCase()}
              icon={<User size={20} />}
              size="lg"
              shape="rounded"
              aria-hidden="true"
            />
            <div className="account-hero-details">
              <div className="account-hero-name">{user.name || 'Unnamed user'}</div>
              <div className="account-hero-email">{user.email}</div>
            </div>
            <div className={`admin-console-status-pill is-${user.accountStatus}`}>
              {user.accountStatus}
            </div>
          </div>

          <section className="drawer-card">
            <div className="drawer-card-title">Account details</div>
            <div className="drawer-card-row">
              <span className="drawer-card-meta">User ID</span>
              <span className="drawer-card-value admin-console-drawer-value">{user.id}</span>
            </div>
            <div className="drawer-card-row">
              <span className="drawer-card-meta">Name</span>
              <span className="drawer-card-value">{user.name || 'Unnamed user'}</span>
            </div>
            <div className="drawer-card-row">
              <span className="drawer-card-meta">Email</span>
              <span className="drawer-card-value admin-console-drawer-value">{user.email}</span>
            </div>
            <div className="drawer-card-row">
              <span className="drawer-card-meta">Avatar</span>
              <span className="drawer-card-value">{user.avatarPresent ? 'Present' : 'Not set'}</span>
            </div>
            <div className="drawer-card-row">
              <span className="drawer-card-meta">Created</span>
              <span className="drawer-card-value">{formatDateTime(user.createdAt)}</span>
            </div>
            <div className="drawer-card-row">
              <span className="drawer-card-meta">Updated</span>
              <span className="drawer-card-value">{formatDateTime(user.updatedAt)}</span>
            </div>
            <div className="drawer-card-row">
              <span className="drawer-card-meta">Disabled at</span>
              <span className="drawer-card-value">{formatDateTime(user.disabledAt)}</span>
            </div>
            <div className="drawer-card-row admin-console-drawer-stack-row">
              <span className="drawer-card-meta">Disable reason</span>
              <span className="drawer-card-value admin-console-drawer-value">
                {user.disabledReason || 'None recorded'}
              </span>
            </div>
          </section>

          {actionError ? <div className="admin-console-error">{actionError}</div> : null}
          {actionMessage ? <div className="admin-console-success">{actionMessage}</div> : null}

          <form className="admin-console-action-card" onSubmit={onPasswordReset}>
            <div className="admin-console-action-header">
              <KeyRound size={16} />
              <h3>Reset password</h3>
            </div>
            <p>Enter a temporary password manually. The user will use it on their next login.</p>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => onNewPasswordChange(event.target.value)}
              placeholder="Temporary password"
              minLength={6}
              disabled={actionLoading}
            />
            <button
              type="submit"
              className="admin-console-primary-btn"
              disabled={actionLoading || newPassword.length < 6}
            >
              {actionLoading ? <Loader2 size={16} className="admin-console-spinner" /> : <KeyRound size={16} />}
              Reset password
            </button>
          </form>

          <div className="admin-console-action-card">
            <div className="admin-console-action-header">
              {user.accountStatus === 'disabled' ? <UserCheck size={16} /> : <UserX size={16} />}
              <h3>Account status</h3>
            </div>
            <p>Disabled accounts cannot log in. Reactivation restores normal login access.</p>

            {user.accountStatus === 'active' ? (
              <>
                <textarea
                  value={disableReason}
                  onChange={(event) => onDisableReasonChange(event.target.value)}
                  placeholder="Optional reason for disabling the account"
                  rows={3}
                  disabled={actionLoading}
                />
                <button
                  type="button"
                  className="admin-console-danger-btn"
                  disabled={actionLoading}
                  onClick={onDisableUser}
                >
                  {actionLoading ? <Loader2 size={16} className="admin-console-spinner" /> : <UserX size={16} />}
                  Disable account
                </button>
              </>
            ) : (
              <button
                type="button"
                className="admin-console-primary-btn"
                disabled={actionLoading}
                onClick={onReactivateUser}
              >
                {actionLoading ? <Loader2 size={16} className="admin-console-spinner" /> : <UserCheck size={16} />}
                Reactivate account
              </button>
            )}
          </div>
        </>
      ) : null}
    </AccountDrawer>
  );
}

function AdminConsole({ route, navigateToRoute }) {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionUser, setSessionUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [activePanel, setActivePanel] = useState('users');

  const [searchInput, setSearchInput] = useState('');
  const deferredSearchInput = useDeferredValue(searchInput);
  const [sortState, setSortState] = useState({
    sortBy: DEFAULT_SORT_BY,
    sortDirection: DEFAULT_SORT_DIRECTION,
  });
  const [totalUsers, setTotalUsers] = useState(0);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [usersReloadKey, setUsersReloadKey] = useState(0);

  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [disableReason, setDisableReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const activeUserId = activePanel === 'users' && route?.section === 'user' ? route.userId : null;
  const activeSearchQuery = deferredSearchInput.trim();
  const hasSearchInput = searchInput.trim().length > 0;

  const handleSessionExpired = useCallback((message = 'Admin session expired. Sign in again.') => {
    setIsAuthenticated(false);
    setSessionUser(null);
    setSessionError(message);
    setTotalUsers(0);
    setUsers([]);
    setUsersError('');
    setSelectedUser(null);
    setDetailError('');
    setActionError('');
    setActionMessage('');
    setNewPassword('');
    setDisableReason('');
    navigateToRoute(createAdminHomeRoute(), { replace: true });
  }, [navigateToRoute]);

  useEffect(() => {
    if (route?.section === 'user') {
      setActivePanel('users');
    }
  }, [route?.section]);

  useEffect(() => {
    if (!ENABLE_ADMIN_CONSOLE) {
      setSessionChecked(true);
      return;
    }

    let cancelled = false;

    async function loadSession() {
      try {
        const data = await getAdminSession();
        if (cancelled) return;
        if (data?.authenticated) {
          const nextUser = data?.user || null;
          setIsAuthenticated(!!nextUser);
          setSessionUser(nextUser);
        } else {
          setIsAuthenticated(false);
          setSessionUser(null);
        }
      } catch (error) {
        if (cancelled) return;
        setSessionError(error.message || 'Failed to load admin session.');
        setIsAuthenticated(false);
        setSessionUser(null);
      } finally {
        if (!cancelled) {
          setSessionChecked(true);
        }
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ENABLE_ADMIN_CONSOLE || !isAuthenticated || activePanel !== 'users') return undefined;

    let cancelled = false;

    async function loadUsers() {
      setUsersLoading(true);
      setUsersError('');

      try {
        const data = await getAdminUsers({
          query: deferredSearchInput.trim(),
          sortBy: sortState.sortBy,
          sortDirection: sortState.sortDirection,
        });
        if (cancelled) return;
        setUsers(Array.isArray(data?.users) ? data.users : []);
        setTotalUsers(Number(data?.pagination?.total || 0));
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 401) {
          handleSessionExpired();
          return;
        }
        setUsersError(error.message || 'Failed to load users.');
      } finally {
        if (!cancelled) {
          setUsersLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [
    deferredSearchInput,
    handleSessionExpired,
    isAuthenticated,
    activePanel,
    sortState.sortBy,
    sortState.sortDirection,
    usersReloadKey,
  ]);

  useEffect(() => {
    if (!ENABLE_ADMIN_CONSOLE || !isAuthenticated || activePanel !== 'users' || !activeUserId) {
      setSelectedUser(null);
      setDetailError('');
      setActionError('');
      setActionMessage('');
      setNewPassword('');
      setDisableReason('');
      return undefined;
    }

    let cancelled = false;

    async function loadUser() {
      setDetailLoading(true);
      setDetailError('');
      setActionError('');
      setActionMessage('');
      setNewPassword('');
      setDisableReason('');

      try {
        const data = await getAdminUser(activeUserId);
        if (cancelled) return;
        setSelectedUser(data?.user || null);
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 401) {
          handleSessionExpired();
          return;
        }
        setSelectedUser(null);
        setDetailError(error.message || 'Failed to load user.');
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [activePanel, activeUserId, handleSessionExpired, isAuthenticated]);

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setLoginLoading(true);
    setSessionError('');

    try {
      const normalizedEmail = loginEmail.trim().toLowerCase();
      const data = await createAdminSession({
        email: normalizedEmail,
        password: loginPassword,
      });
      const nextUser = data?.user || null;
      setIsAuthenticated(!!nextUser);
      setSessionUser(nextUser);
      setLoginPassword('');
      setShowLoginPassword(false);
      setLoginEmail(normalizedEmail);
    } catch (error) {
      setSessionError(error.message || 'Failed to start support session.');
      setIsAuthenticated(false);
      setSessionUser(null);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await destroyAdminSession();
    } catch {
      // Ignore logout failures and clear local state anyway.
    }

    setIsAuthenticated(false);
    setSessionUser(null);
    setSessionError('');
    setTotalUsers(0);
    setSelectedUser(null);
    setUsers([]);
    setUsersError('');
    setActionMessage('');
    setActionError('');
    setLoginPassword('');
    navigateToRoute(createAdminHomeRoute(), { replace: true });
  }

  async function handlePasswordReset(event) {
    event.preventDefault();
    if (!selectedUser?.id) return;

    setActionLoading(true);
    setActionError('');
    setActionMessage('');

    try {
      const data = await adminResetUserPassword(selectedUser.id, { newPassword });
      setSelectedUser(data?.user || null);
      setNewPassword('');
      setActionMessage(`Password updated for ${selectedUser.email}.`);
      setUsersReloadKey((current) => current + 1);
    } catch (error) {
      if (error?.status === 401) {
        handleSessionExpired();
        return;
      }
      setActionError(error.message || 'Failed to reset password.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisableUser() {
    if (!selectedUser?.id) return;

    setActionLoading(true);
    setActionError('');
    setActionMessage('');

    try {
      const data = await adminDisableUser(selectedUser.id, { reason: disableReason });
      setSelectedUser(data?.user || null);
      setActionMessage(`Disabled ${selectedUser.email}.`);
      setUsersReloadKey((current) => current + 1);
    } catch (error) {
      if (error?.status === 401) {
        handleSessionExpired();
        return;
      }
      setActionError(error.message || 'Failed to disable user.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReactivateUser() {
    if (!selectedUser?.id) return;

    setActionLoading(true);
    setActionError('');
    setActionMessage('');

    try {
      const data = await adminReactivateUser(selectedUser.id);
      setSelectedUser(data?.user || null);
      setDisableReason('');
      setActionMessage(`Reactivated ${selectedUser.email}.`);
      setUsersReloadKey((current) => current + 1);
    } catch (error) {
      if (error?.status === 401) {
        handleSessionExpired();
        return;
      }
      setActionError(error.message || 'Failed to reactivate user.');
    } finally {
      setActionLoading(false);
    }
  }

  function handleSearchChange(event) {
    setSearchInput(event.target.value);
  }

  function handleSort(sortBy) {
    setSortState((current) => {
      if (current.sortBy === sortBy) {
        return {
          sortBy,
          sortDirection: current.sortDirection === 'asc' ? 'desc' : 'asc',
        };
      }

      return {
        sortBy,
        sortDirection: getDefaultSortDirection(sortBy),
      };
    });
  }

  function handleSelectUser(userId) {
    setActivePanel('users');
    navigateToRoute(createAdminUserRoute(userId));
  }

  function handleRowKeyDown(event, userId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelectUser(userId);
    }
  }

  function handleCloseDrawer() {
    setDetailError('');
    setActionError('');
    setActionMessage('');
    setNewPassword('');
    setDisableReason('');
    navigateToRoute(createAdminHomeRoute());
  }

  function handleShowUsers() {
    setActivePanel('users');
  }

  function handleShowFeedback() {
    setActivePanel('feedback');
    if (route?.section === 'user') {
      navigateToRoute(createAdminHomeRoute(), { replace: true });
    }
  }

  if (!ENABLE_ADMIN_CONSOLE) {
    return (
      <div className="admin-console-page">
        <div className="admin-console-disabled">
          <div className="admin-console-badge">Private Surface</div>
          <h1>Support Console Disabled</h1>
          <p>This environment is not exposing the private admin console.</p>
        </div>
      </div>
    );
  }

  if (!sessionChecked) {
    return (
      <div className="admin-console-page">
        <div className="admin-console-loading">
          <Loader2 size={18} className="admin-console-spinner" />
          <span>Loading support console…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="admin-console-page">
        <div className="admin-console-auth-card">
          <div className="admin-console-badge">Private Surface</div>
          <h1>Support Console</h1>
          <p>
            Use an existing app account that has support console access.
          </p>
          <form className="admin-console-auth-form" onSubmit={handleLoginSubmit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="support@example.com"
                autoComplete="username"
                disabled={loginLoading}
              />
            </label>
            <label>
              <span>Password</span>
              <div className="admin-console-password-field">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="Enter your account password"
                  autoComplete="current-password"
                  disabled={loginLoading}
                />
                <button
                  type="button"
                  className="admin-console-password-toggle"
                  onClick={() => setShowLoginPassword((current) => !current)}
                  disabled={loginLoading}
                >
                  {showLoginPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <div className="admin-console-field-note">
              This uses your normal app credentials, but creates a separate support session.
            </div>
            {sessionError ? <div className="admin-console-error">{sessionError}</div> : null}
            <button
              type="submit"
              className="admin-console-primary-btn"
              disabled={loginLoading || !loginEmail.trim() || !loginPassword}
            >
              {loginLoading ? <Loader2 size={16} className="admin-console-spinner" /> : <KeyRound size={16} />}
              Start support session
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-console-page">
      <div className="admin-console-shell">
        <header className="admin-console-header">
          <div>
            <div className="admin-console-badge">Private Surface</div>
            <h1>Support Console</h1>
            <p>Support-only access for user support operations and feedback triage.</p>
            <div className="admin-console-surface-nav">
              <button
                type="button"
                className={`admin-console-surface-tab ${activePanel === 'users' ? 'is-active' : ''}`}
                onClick={handleShowUsers}
              >
                <User size={16} />
                Users
              </button>
              <button
                type="button"
                className={`admin-console-surface-tab ${activePanel === 'feedback' ? 'is-active' : ''}`}
                onClick={handleShowFeedback}
              >
                <MessageSquare size={16} />
                Feedback
              </button>
            </div>
          </div>
          <div className="admin-console-header-actions">
            <div className="admin-console-operator">
              <Shield size={16} />
              <div className="admin-console-operator-copy">
                <span>{sessionUser?.name || sessionUser?.email || 'Admin'}</span>
                <small>
                  {sessionUser?.name
                    ? `${sessionUser.email} · ${formatAdminRole(sessionUser?.adminRole)}`
                    : formatAdminRole(sessionUser?.adminRole)}
                </small>
              </div>
            </div>
            <button type="button" className="admin-console-secondary-btn" onClick={handleLogout}>
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </header>

        {sessionError ? <div className="admin-console-error admin-console-banner">{sessionError}</div> : null}

        {activePanel === 'users' ? (
          <section className="admin-console-panel admin-console-table-panel">
            <div className="admin-console-table-toolbar">
              <div className="admin-console-search-row">
                <div className="admin-console-search-input">
                  <Search size={16} />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={handleSearchChange}
                    placeholder="Search by email or name"
                  />
                </div>
                {hasSearchInput ? (
                  <button
                    type="button"
                    className="admin-console-secondary-btn admin-console-search-clear"
                    onClick={() => setSearchInput('')}
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="admin-console-list-meta">
                <span>{activeSearchQuery ? 'Matching users' : 'Recent users'}</span>
                <span>
                  {usersLoading && users.length > 0
                    ? 'Refreshing…'
                    : totalUsers === 0
                      ? '0 results'
                      : `${totalUsers} result${totalUsers === 1 ? '' : 's'}`}
                </span>
              </div>
            </div>

            {usersError ? <div className="admin-console-error">{usersError}</div> : null}

            <div className="admin-console-table-frame">
              {usersLoading && users.length === 0 ? (
                <div className="admin-console-empty admin-console-table-state">
                  <div className="admin-console-empty-icon">
                    <Loader2 size={18} className="admin-console-spinner" />
                  </div>
                  <div className="admin-console-empty-copy">
                    <div className="admin-console-empty-title">Loading users</div>
                    <div className="admin-console-empty-subtitle">
                      Pulling the latest support records for this workspace.
                    </div>
                  </div>
                </div>
              ) : null}

              {!usersLoading && users.length === 0 ? (
                <div className="admin-console-empty admin-console-table-state">
                  <div className="admin-console-empty-icon">
                    <ShieldAlert size={18} />
                  </div>
                  <div className="admin-console-empty-copy">
                    <div className="admin-console-empty-title">
                      {activeSearchQuery ? 'No matching users' : 'No users yet'}
                    </div>
                    <div className="admin-console-empty-subtitle">
                      {activeSearchQuery
                        ? 'Try another email address or a different name search.'
                        : 'Accounts will appear here as new testers sign up.'}
                    </div>
                  </div>
                </div>
              ) : null}

              {users.length > 0 ? (
                <div className="admin-console-table-scroll">
                  <table className="admin-console-table">
                    <thead>
                      <tr>
                        {SORTABLE_COLUMNS.map((column) => {
                          const isActive = sortState.sortBy === column.key;
                          const ariaSort = isActive
                            ? (sortState.sortDirection === 'asc' ? 'ascending' : 'descending')
                            : 'none';

                          return (
                            <th key={column.key} scope="col" aria-sort={ariaSort}>
                              <button
                                type="button"
                                className={`admin-console-sort-btn${isActive ? ' is-active' : ''}`}
                                onClick={() => handleSort(column.key)}
                              >
                                <span>{column.label}</span>
                                <SortIcon active={isActive} direction={sortState.sortDirection} />
                              </button>
                            </th>
                          );
                        })}
                        <th scope="col" className="admin-console-expand-col">Expand</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr
                          key={user.id}
                          className={activeUserId === user.id ? 'is-selected' : ''}
                          onClick={() => handleSelectUser(user.id)}
                          onKeyDown={(event) => handleRowKeyDown(event, user.id)}
                          tabIndex={0}
                          aria-selected={activeUserId === user.id}
                        >
                          <td>
                            <div className="admin-console-name-cell">
                              <Avatar
                                className="admin-console-avatar"
                                src={user.avatarUrl}
                                label={String(user.name || 'A').trim().charAt(0).toUpperCase()}
                                icon={<User size={18} />}
                                size="xl"
                                shape="rounded"
                                aria-hidden="true"
                              />
                              <span className="admin-console-cell-primary">
                                {user.name || 'Unnamed user'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="admin-console-cell-secondary">{user.email}</span>
                          </td>
                          <td>
                            <span className={`admin-console-status-pill is-${user.accountStatus}`}>
                              {user.accountStatus}
                            </span>
                          </td>
                          <td>
                            <span className="admin-console-cell-secondary">
                              {formatTableTimestamp(user.updatedAt)}
                            </span>
                          </td>
                          <td className="admin-console-expand-cell">
                            <button
                              type="button"
                              className="admin-console-row-expand"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSelectUser(user.id);
                              }}
                              aria-label={`Open support details for ${user.email}`}
                            >
                              <PanelRightOpen size={16} />
                              <span>Open</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <FeedbackConsole onSessionExpired={handleSessionExpired} />
        )}
      </div>

      {activePanel === 'users' ? (
        <AdminUserDrawer
          isOpen={!!activeUserId}
          user={selectedUser}
          loading={detailLoading}
          error={detailError}
          actionLoading={actionLoading}
          actionError={actionError}
          actionMessage={actionMessage}
          newPassword={newPassword}
          disableReason={disableReason}
          onNewPasswordChange={setNewPassword}
          onDisableReasonChange={setDisableReason}
          onPasswordReset={handlePasswordReset}
          onDisableUser={handleDisableUser}
          onReactivateUser={handleReactivateUser}
          onClose={handleCloseDrawer}
        />
      ) : null}
    </div>
  );
}

export default AdminConsole;
