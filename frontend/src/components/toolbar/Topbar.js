import React, { useEffect, useRef, useState } from 'react';
import {
  Folder,
  History,
  LogIn,
  LogOut,
  Mail,
  Settings2,
  ShieldCheck,
  UserCircle,
  User,
} from 'lucide-react';

import ScanBar from '../scan/ScanBar';
import Button from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import mapmatLogo from '../../assets/MM-Logo.svg';
import { APP_BRAND_NAME, APP_ONLY_MODE } from '../../utils/constants';
import { resolveApiAssetUrl } from '../../utils/assets';

const Topbar = ({
  canEdit,
  urlInput,
  onUrlInputChange,
  onUrlKeyDown,
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
  scanLabel,
  scanDisabled,
  scanTitle,
  optionsDisabled,
  onClearUrl,
  showClearUrl,
  sharedTitle,
  showScanBar = true,
  onShowProjects,
  onShowHistory,
  onShowInvites,
  onShowAccessRequests,
  pendingInviteCount = 0,
  pendingAccessRequestCount = 0,
}) => {
  const { isLoggedIn, currentUser, onShowProfile, onShowSettings, onLogout, onLogin } = useAuth();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuRef = useRef(null);

  useEffect(() => {
    if (!showAccountMenu) return;
    const handleClickOutside = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setShowAccountMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountMenu]);

  const handleAccountToggle = () => setShowAccountMenu((prev) => !prev);
  const closeMenu = () => setShowAccountMenu(false);

  const totalPendingCount = pendingInviteCount + pendingAccessRequestCount;

  return (
    <div className="topbar" data-feedback-id="topbar" data-feedback-label="Top navigation">
      <div className="topbar-left">
        <div className="brand">
          {APP_ONLY_MODE ? (
            <span className="brand-text">{APP_BRAND_NAME}</span>
          ) : (
            <img className="brand-logo" src={mapmatLogo} alt="Map Mat" />
          )}
        </div>
      </div>

      <div className="topbar-center">
        {showScanBar ? (
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
              scanLabel={scanLabel}
              scanDisabled={scanDisabled}
              scanTitle={scanTitle}
              optionsDisabled={optionsDisabled}
              onClearUrl={onClearUrl}
              showClearUrl={showClearUrl}
              sharedTitle={sharedTitle}
            />
          </div>
        ) : (
          <div className="topbar-center-spacer" aria-hidden="true" />
        )}
      </div>

      <div className="topbar-right">
        {isLoggedIn ? (
          <div className="account-menu-wrapper" ref={accountMenuRef}>
            <button
              className="user-btn"
              onClick={handleAccountToggle}
              title="Account Menu"
              aria-expanded={showAccountMenu}
              aria-haspopup="menu"
            >
              {resolveApiAssetUrl(currentUser?.avatarUrl) ? (
                <img
                  className="user-btn-avatar"
                  src={resolveApiAssetUrl(currentUser?.avatarUrl)}
                  alt=""
                />
              ) : (
                <User size={18} />
              )}
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
          <Button className="topbar-login-btn" title="Log In" onClick={onLogin}>
            <LogIn size={18} />
            <span>Log In</span>
          </Button>
        )}
      </div>
    </div>
  );
};

export default Topbar;
