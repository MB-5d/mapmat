import React from 'react';
import {
  Folder,
  History,
  LogIn,
  LogOut,
  Plus,
  Upload,
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
}) => (
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

      {canEdit && (
        <button
          className="icon-btn"
          title="Projects"
          onClick={onShowProjects}
        >
          <Folder size={22} />
        </button>
      )}

      {isLoggedIn && (
        <button
          className="icon-btn"
          title="Scan History"
          onClick={onShowHistory}
        >
          <History size={22} />
        </button>
      )}

      <div className="divider" />

      {isLoggedIn ? (
        <>
          <button
            className="user-btn"
            onClick={onShowProfile}
            title="Account Settings"
          >
            <User size={18} />
            <span>{currentUser?.name}</span>
          </button>
          <button className="icon-btn" title="Logout" onClick={onLogout}>
            <LogOut size={22} />
          </button>
        </>
      ) : (
        <button className="icon-btn primary" title="Login" onClick={onLogin}>
          <LogIn size={22} />
        </button>
      )}
    </div>
  </div>
);

export default Topbar;
