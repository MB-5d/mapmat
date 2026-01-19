import React, { useEffect, useRef, useState } from 'react';
import {
  Folder,
  History,
  LogIn,
  LogOut,
  Plus,
  Receipt,
  Settings2,
  Upload,
  UserCircle,
  User,
} from 'lucide-react';

import ScanBar from '../scan/ScanBar';

const Topbar = ({
  canEdit,
  urlInput,
  onUrlInputChange,
  onUrlKeyDown,
  hasMap,
  showThumbnails,
  onToggleThumbnails,
  scanOptions,
  showScanOptions,
  scanOptionsRef,
  onToggleScanOptions,
  onScanOptionChange,
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
  isLoggedIn,
  currentUser,
  onShowProfile,
  onLogout,
  onLogin,
}) => {
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuRef = useRef(null);

  useEffect(() => {
    if (!showAccountMenu) return;
    const handleClickOutside = (event) => {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(event.target)) {
        setShowAccountMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountMenu]);

  const handleAccountToggle = () => setShowAccountMenu((prev) => !prev);
  const closeMenu = () => setShowAccountMenu(false);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="brand">Map Mat</div>
      </div>

    <div className="topbar-center">
      <div className="search-container">
        <ScanBar
          canEdit={canEdit}
          urlInput={urlInput}
          onUrlInputChange={onUrlInputChange}
          onUrlKeyDown={onUrlKeyDown}
          showThumbnails={showThumbnails}
          onToggleThumbnails={onToggleThumbnails}
          options={scanOptions}
          showOptions={showScanOptions}
          optionsRef={scanOptionsRef}
          onToggleOptions={onToggleScanOptions}
          onOptionChange={onScanOptionChange}
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
      {canEdit && (
        <button
          className="icon-btn"
          title="Create New Map"
          onClick={onCreateMap}
        >
          <Plus size={22} />
        </button>
      )}

      {canEdit && (
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
          </button>
          {showAccountMenu && (
            <div className="account-menu" role="menu">
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
              <button className="account-menu-item" role="menuitem" type="button">
                <Receipt size={16} />
                <span>Billing</span>
              </button>
              <button className="account-menu-item" role="menuitem" type="button">
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
