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
import { MenuDivider, MenuItem, MenuPanel, MenuSectionHeader } from '../ui/Menu';
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
  const accountTriggerIcon = resolveApiAssetUrl(currentUser?.avatarUrl) ? (
    <img
      className="user-btn-avatar"
      src={resolveApiAssetUrl(currentUser?.avatarUrl)}
      alt=""
    />
  ) : (
    <User size={18} />
  );

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
          <div className="search-container scan-bar-shell">
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
            <Button
              className="topbar-account-trigger"
              type="ghost"
              buttonStyle="mono"
              size="sm"
              onClick={handleAccountToggle}
              title="Account Menu"
              aria-expanded={showAccountMenu}
              aria-haspopup="menu"
              startIcon={accountTriggerIcon}
              label={currentUser?.name || 'Account'}
            />
            {showAccountMenu && (
              <MenuPanel className="account-menu" role="menu">
                <div className="ui-menu-section" role="group" aria-label="Collaboration">
                  <MenuSectionHeader>Collaboration</MenuSectionHeader>
                  <MenuItem
                    className="account-menu-item"
                    role="menuitem"
                    icon={<Mail size={16} />}
                    label="Invites"
                    badge={pendingInviteCount > 0 ? (
                      <span className="account-menu-item-badge">{pendingInviteCount > 9 ? '9+' : pendingInviteCount}</span>
                    ) : null}
                    onClick={() => {
                      closeMenu();
                      onShowInvites?.();
                    }}
                  />
                  <MenuItem
                    className="account-menu-item"
                    role="menuitem"
                    icon={<ShieldCheck size={16} />}
                    label="Requests"
                    badge={pendingAccessRequestCount > 0 ? (
                      <span className="account-menu-item-badge">{pendingAccessRequestCount > 9 ? '9+' : pendingAccessRequestCount}</span>
                    ) : null}
                    onClick={() => {
                      closeMenu();
                      onShowAccessRequests?.();
                    }}
                  />
                </div>
                <MenuDivider className="account-menu-divider" />
                <div className="ui-menu-section" role="group" aria-label="Workspace">
                  <MenuSectionHeader>Workspace</MenuSectionHeader>
                  <MenuItem
                    className="account-menu-item"
                    role="menuitem"
                    icon={<Folder size={16} />}
                    label="Projects"
                    onClick={() => {
                      closeMenu();
                      onShowProjects();
                    }}
                  />
                  <MenuItem
                    className="account-menu-item"
                    role="menuitem"
                    icon={<History size={16} />}
                    label="History"
                    onClick={() => {
                      closeMenu();
                      onShowHistory();
                    }}
                  />
                </div>
                <MenuDivider className="account-menu-divider" />
                <div className="ui-menu-section" role="group" aria-label="Account">
                  <MenuSectionHeader>Account</MenuSectionHeader>
                  <MenuItem
                    className="account-menu-item"
                    role="menuitem"
                    icon={<UserCircle size={16} />}
                    label="Profile"
                    onClick={() => {
                      closeMenu();
                      onShowProfile();
                    }}
                  />
                  <MenuItem
                    className="account-menu-item"
                    role="menuitem"
                    icon={<Settings2 size={16} />}
                    label="Settings"
                    onClick={() => {
                      closeMenu();
                      onShowSettings();
                    }}
                  />
                  <MenuItem
                    className="account-menu-item account-menu-logout"
                    role="menuitem"
                    icon={<LogOut size={16} />}
                    label="Log out"
                    danger
                    onClick={() => {
                      closeMenu();
                      onLogout();
                    }}
                  />
                </div>
              </MenuPanel>
            )}
          </div>
        ) : (
          <Button className="topbar-login-btn" title="Log In" onClick={onLogin} startIcon={<LogIn size={18} />}>
            Log In
          </Button>
        )}
      </div>
    </div>
  );
};

export default Topbar;
