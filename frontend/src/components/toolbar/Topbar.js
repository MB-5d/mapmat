import React, { useEffect, useRef, useState } from 'react';
import {
  CreditCard,
  ExternalLink,
  History,
  LogIn,
  LogOut,
  Mail,
  Network,
  Settings2,
  ShieldCheck,
  UserCircle,
  User,
} from 'lucide-react';

import ScanBar from '../scan/ScanBar';
import VellicLogo from '../brand/VellicLogo';
import CanvasMapHeader from './CanvasMapHeader';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import { MenuDivider, MenuItem, MenuPanel, MenuSectionHeader } from '../ui/Menu';
import { useAuth } from '../../contexts/AuthContext';
import { APP_BRAND_NAME } from '../../utils/constants';

const FIGMA_CAPTURE_TOOLS_ENABLED = process.env.NODE_ENV !== 'production';

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
  onScan,
  scanLabel,
  scanDisabled,
  scanTitle,
  scanControlsDisabled,
  optionsDisabled,
  onClearUrl,
  showClearUrl,
  hasMap,
  mapName,
  isEditingMapName,
  onMapNameChange,
  onMapNameBlur,
  onMapNameKeyDown,
  onMapNameClick,
  onMapLogoClick,
  collaborators = [],
  sharedTitle,
  showScanBar = true,
  scanPlaceholder,
  appHome = false,
  onShowProjects,
  onShowHistory,
  onShowInvites,
  onShowAccessRequests,
  pendingInviteCount = 0,
  pendingAccessRequestCount = 0,
}) => {
  const { isLoggedIn, currentUser, onShowProfile, onShowBilling, onShowSettings, onLogout, onLogin, onSignup } = useAuth();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuRef = useRef(null);
  const figmaAccountMenuAppliedRef = useRef('');
  const isLocalFigmaCaptureHost = FIGMA_CAPTURE_TOOLS_ENABLED && typeof window !== 'undefined' && (
    window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.hostname === '0.0.0.0'
    || window.location.hostname === '[::1]'
    || window.location.hostname === '::1'
  );
  const figmaState = isLocalFigmaCaptureHost
    ? String(new URLSearchParams(window.location.search || '').get('figmaState') || '').trim().toLowerCase()
    : '';
  const figmaCaptureKey = isLocalFigmaCaptureHost
    ? `${window.location.pathname}|${window.location.search}|${figmaState}`
    : '';

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

  useEffect(() => {
    if (!isLocalFigmaCaptureHost || figmaState !== 'account-menu' || !isLoggedIn) return;
    if (figmaAccountMenuAppliedRef.current === figmaCaptureKey) return;
    figmaAccountMenuAppliedRef.current = figmaCaptureKey;
    setShowAccountMenu(true);
  }, [figmaCaptureKey, figmaState, isLocalFigmaCaptureHost, isLoggedIn]);

  const handleAccountToggle = () => setShowAccountMenu((prev) => !prev);
  const closeMenu = () => setShowAccountMenu(false);
  const accountTriggerIcon = (
    <Avatar
      className="user-btn-avatar"
      src={currentUser?.avatarUrl}
      label={String(currentUser?.name || 'A').trim().charAt(0).toUpperCase()}
      icon={<User size={18} />}
      size="xs"
      aria-hidden="true"
    />
  );
  const hasPendingAccountNotifications = pendingInviteCount > 0 || pendingAccessRequestCount > 0;

  const isFloatingTopbar = hasMap || appHome;
  const topbarClassName = [
    'topbar',
    isFloatingTopbar ? 'topbar--floating' : '',
    appHome ? 'topbar--app-home' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={topbarClassName} data-feedback-id="topbar" data-feedback-label="Top navigation">
      <div className="topbar-left">
        {hasMap ? (
          <CanvasMapHeader
            canEdit={canEdit}
            mapName={mapName}
            isEditingMapName={isEditingMapName}
            onMapNameChange={onMapNameChange}
            onMapNameBlur={onMapNameBlur}
            onMapNameKeyDown={onMapNameKeyDown}
            onMapNameClick={onMapNameClick}
            onBrandMarkClick={onMapLogoClick}
            collaborators={collaborators}
            showBrandMark
          />
        ) : (
          <div className="brand">
            <VellicLogo className="brand-logo" title={APP_BRAND_NAME} />
          </div>
        )}
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
              onScan={onScan}
              scanLabel={scanLabel}
              scanDisabled={scanDisabled}
              scanTitle={scanTitle}
              controlsDisabled={scanControlsDisabled}
              optionsDisabled={optionsDisabled}
              onClearUrl={onClearUrl}
              showClearUrl={showClearUrl}
              sharedTitle={sharedTitle}
              placeholder={scanPlaceholder}
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
              size="md"
              onClick={handleAccountToggle}
              title="Account menu"
              aria-expanded={showAccountMenu}
              aria-haspopup="menu"
              startIcon={accountTriggerIcon}
              label={currentUser?.name || 'Account'}
            />
            {hasPendingAccountNotifications ? (
              <span className="topbar-account-notification-dot" aria-hidden="true" />
            ) : null}
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
                    icon={<Network size={16} />}
                    label="Maps"
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
                    className="account-menu-item account-menu-item--external"
                    role="menuitem"
                    icon={<CreditCard size={16} />}
                    label="Billing"
                    endSlot={<ExternalLink className="account-menu-external-icon" size={14} aria-hidden="true" />}
                    onClick={() => {
                      closeMenu();
                      onShowBilling?.();
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
          <Button
            className="topbar-login-btn"
            type="primary"
            buttonStyle="brand"
            size="md"
            title="Sign up / log in"
            onClick={onSignup || onLogin}
            startIcon={<LogIn size={18} />}
          >
            Sign up / log in
          </Button>
        )}
      </div>
    </div>
  );
};

export default Topbar;
