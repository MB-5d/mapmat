import React, { useEffect, useRef, useState } from 'react';
import {
  Folder,
  History,
  LogIn,
  LogOut,
  Mail,
  Plus,
  Settings2,
  ShieldCheck,
  Upload,
  UserCircle,
  User,
} from 'lucide-react';

import ScanBar from '../scan/ScanBar';
import { useAuth } from '../../contexts/AuthContext';
import mapmatLogo from '../../assets/MM-Logo.svg';

const Topbar = ({
  canEdit,
  urlInput,
  onUrlInputChange,
  onUrlKeyDown,
  hasMap,
  scanOptions,
  showScanOptions,
  scanOptionsRef,
  onToggleScanOptions,
  onScanOptionChange,
  scanLayerAvailability,
  scanLayerVisibility,
  onToggleScanLayer,
  scanDepth,
  onScanDepthChange,
  onScan,
  scanDisabled,
  scanTitle,
  optionsDisabled,
  onClearUrl,
  showClearUrl,
  mapName,
  isEditingMapName,
  onMapNameChange,
  onMapNameBlur,
  onMapNameKeyDown,
  onMapNameClick,
  sharedTitle,
  onCreateMap,
  onImportFile,
  onShowProjects,
  onShowHistory,
  onShowInvites,
  onShowAccessRequests,
  pendingInviteCount = 0,
  pendingAccessRequestCount = 0,
  titleCollaborators = [],
}) => {
  const { isLoggedIn, currentUser, onShowProfile, onShowSettings, onLogout, onLogin } = useAuth();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showCollaboratorMenu, setShowCollaboratorMenu] = useState(false);
  const accountMenuRef = useRef(null);
  const collaboratorMenuRef = useRef(null);

  useEffect(() => {
    if (!showAccountMenu && !showCollaboratorMenu) return;
    const handleClickOutside = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setShowAccountMenu(false);
      }
      if (collaboratorMenuRef.current && !collaboratorMenuRef.current.contains(event.target)) {
        setShowCollaboratorMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountMenu, showCollaboratorMenu]);

  const handleAccountToggle = () => setShowAccountMenu((prev) => !prev);
  const closeMenu = () => setShowAccountMenu(false);

  const totalPendingCount = pendingInviteCount + pendingAccessRequestCount;
  const visibleCollaborators = titleCollaborators.slice(0, 2);
  const hiddenCollaboratorCount = Math.max(0, titleCollaborators.length - visibleCollaborators.length);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <img className="brand-logo" src={mapmatLogo} alt="Map Mat" />
        </div>
      </div>

      <div className="topbar-center">
        <div className="search-container">
          <ScanBar
            canEdit={canEdit}
            urlInput={urlInput}
            onUrlInputChange={onUrlInputChange}
            onUrlKeyDown={onUrlKeyDown}
            options={scanOptions}
            showOptions={showScanOptions}
            optionsRef={scanOptionsRef}
            onToggleOptions={onToggleScanOptions}
            onOptionChange={onScanOptionChange}
            scanLayerAvailability={scanLayerAvailability}
            scanLayerVisibility={scanLayerVisibility}
            onToggleScanLayer={onToggleScanLayer}
            scanDepth={scanDepth}
            onScanDepthChange={onScanDepthChange}
            onScan={onScan}
            scanDisabled={scanDisabled}
            scanTitle={scanTitle}
            optionsDisabled={optionsDisabled}
            onClearUrl={onClearUrl}
            showClearUrl={showClearUrl}
            sharedTitle={sharedTitle}
          />
        </div>

        {hasMap && (
          <div className="map-name-container">
            {isEditingMapName ? (
              <input
                className="map-name-input"
                value={mapName}
                onChange={onMapNameChange}
                onBlur={onMapNameBlur}
                onKeyDown={onMapNameKeyDown}
                autoFocus
                spellCheck={false}
              />
            ) : (
              <span
                className="map-name-display"
                onClick={onMapNameClick}
                title={canEdit ? "Click to rename" : mapName}
              >
                {mapName || 'Untitled Map'}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="topbar-right">
        {titleCollaborators.length > 0 && (
          <div className="topbar-collaborators" ref={collaboratorMenuRef}>
            <button
              type="button"
              className="topbar-collaborator-stack"
              title={`${titleCollaborators.length} active collaborator${titleCollaborators.length === 1 ? '' : 's'}`}
              aria-haspopup="menu"
              aria-expanded={showCollaboratorMenu}
              onClick={() => setShowCollaboratorMenu((prev) => !prev)}
            >
              {visibleCollaborators.map((collaborator) => (
                <span
                  key={collaborator.id}
                  className={`topbar-collaborator-avatar tone-${collaborator.tone}`}
                  aria-hidden="true"
                >
                  {collaborator.avatarLabel}
                </span>
              ))}
              {hiddenCollaboratorCount > 0 && (
                <span className="topbar-collaborator-hover-count" aria-hidden="true">
                  {titleCollaborators.length}
                </span>
              )}
            </button>
            {showCollaboratorMenu && (
              <div className="topbar-collaborator-menu" role="menu">
                <div className="topbar-collaborator-menu-header">
                  {titleCollaborators.length} active collaborator{titleCollaborators.length === 1 ? '' : 's'}
                </div>
                {titleCollaborators.map((collaborator) => (
                  <div key={collaborator.id} className="topbar-collaborator-item" role="menuitem">
                    <span className={`topbar-collaborator-avatar tone-${collaborator.tone}`} aria-hidden="true">
                      {collaborator.avatarLabel}
                    </span>
                    <div className="topbar-collaborator-item-copy">
                      <span className="topbar-collaborator-item-name">{collaborator.label}</span>
                      <span className="topbar-collaborator-item-role">{String(collaborator.accessMode || 'view')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {(isLoggedIn ? canEdit : true) && (
          <button
            className="icon-btn"
            title="Create New Map"
            onClick={onCreateMap}
          >
            <Plus size={22} />
          </button>
        )}

        {(isLoggedIn ? canEdit : true) && (
          <button
            className="icon-btn"
            title="Import File"
            onClick={onImportFile}
          >
            <Upload size={22} />
          </button>
        )}

        <div className="divider" />

        {isLoggedIn ? (
          <div className="account-menu-wrapper" ref={accountMenuRef}>
            <button
              className="user-btn"
              onClick={handleAccountToggle}
              title="Account Menu"
              aria-expanded={showAccountMenu}
              aria-haspopup="menu"
            >
              <User size={18} />
              <span>{currentUser?.name}</span>
              {totalPendingCount > 0 ? (
                <span className="account-menu-badge" aria-label={`${totalPendingCount} pending collaboration items`}>
                  {totalPendingCount > 9 ? '9+' : totalPendingCount}
                </span>
              ) : null}
            </button>
            {showAccountMenu && (
              <div className="account-menu" role="menu">
                <button
                  className="account-menu-item"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onShowInvites?.();
                  }}
                >
                  <Mail size={16} />
                  <span>Invites</span>
                  {pendingInviteCount > 0 ? (
                    <span className="account-menu-item-badge">{pendingInviteCount > 9 ? '9+' : pendingInviteCount}</span>
                  ) : null}
                </button>
                <button
                  className="account-menu-item"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onShowAccessRequests?.();
                  }}
                >
                  <ShieldCheck size={16} />
                  <span>Requests</span>
                  {pendingAccessRequestCount > 0 ? (
                    <span className="account-menu-item-badge">{pendingAccessRequestCount > 9 ? '9+' : pendingAccessRequestCount}</span>
                  ) : null}
                </button>
                <div className="account-menu-divider" />
                <button
                  className="account-menu-item"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onShowProjects();
                  }}
                >
                  <Folder size={16} />
                  <span>Projects</span>
                </button>
                <button
                  className="account-menu-item"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onShowHistory();
                  }}
                >
                  <History size={16} />
                  <span>History</span>
                </button>
                <div className="account-menu-divider" />
                <button
                  className="account-menu-item"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onShowProfile();
                  }}
                >
                  <UserCircle size={16} />
                  <span>Profile</span>
                </button>
                <button
                  className="account-menu-item"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    closeMenu();
                    onShowSettings();
                  }}
                >
                  <Settings2 size={16} />
                  <span>Settings</span>
                </button>
                <div className="account-menu-divider" />
                <button
                  className="account-menu-item account-menu-logout"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onLogout();
                  }}
                >
                  <LogOut size={16} />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="topbar-login-btn" title="Log In" onClick={onLogin}>
            <LogIn size={18} />
            <span>Log In</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default Topbar;
