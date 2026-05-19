import React from 'react';
import {
  Bookmark,
  CopyPlus,
  Download,
  FilePlus,
  GanttChartSquare,
  History,
  Image,
  Eye,
  EyeOff,
  Layers,
  Link2,
  Loader2,
  MessageSquare,
  MousePointer2,
  Palette,
  RefreshCcw,
  Redo2,
  Share2,
  Undo2,
  Workflow,
} from 'lucide-react';

import IconButton from '../ui/IconButton';
import { MenuDivider, MenuItem, MenuPanel, MenuSectionHeader } from '../ui/Menu';

const ToolButton = ({
  active = false,
  className = '',
  disabled = false,
  children,
  icon,
  label,
  title,
  ...props
}) => {
  const iconContent = children ? (
    <span className="canvas-tool-btn__content">
      {icon}
      {children}
    </span>
  ) : icon;

  return (
    <IconButton
      className={`canvas-tool-btn ${active ? 'active' : ''} ${disabled ? 'disabled' : ''} ${className}`.trim()}
      type="ghost"
      buttonStyle="mono"
      size="md"
      active={active}
      disabled={disabled}
      icon={iconContent}
      label={label || title}
      title={title || label}
      {...props}
    />
  );
};

const containMenuScroll = (event) => {
  event.stopPropagation();
};

const CanvasToolbar = ({
  canEdit,
  canViewComments,
  canViewVersionHistory,
  activeTool,
  connectionTool,
  onSelectTool,
  onAddPage,
  onToggleUserFlow,
  onToggleCrosslink,
  showCommentsPanel,
  onToggleCommentsPanel,
  hasUnreadCommentMentions,
  showReportDrawer,
  onToggleReportDrawer,
  showLayersMenu,
  onToggleLayersMenu,
  layersMenuRef,
  layersPanel,
  showLegendMenu,
  onToggleLegendMenu,
  legendMenuRef,
  legendPanel,
  onToggleImageMenu,
  onGetThumbnailsAll,
  onGetThumbnailsSelected,
  onUpdateCapturedThumbnails,
  onGetFullScreenshotsAll,
  onGetFullScreenshotsSelected,
  onUpdateCapturedFullScreenshots,
  onDownloadImagesAll,
  onDownloadImagesSelected,
  onToggleThumbnails,
  showThumbnails,
  hasAnyThumbnails,
  hasDownloadableThumbnails,
  hasDownloadableSelectedThumbnails,
  hasFullScreenshotAssets,
  hasSelectedFullScreenshotAssets,
  hasDownloadableImages,
  hasDownloadableSelectedImages,
  thumbnailsAllLabel = 'Get Visible area (All)',
  thumbnailsSelectedLabel = 'Get Visible area (Selected)',
  fullScreenshotsAllLabel = 'Get Full page (All)',
  fullScreenshotsSelectedLabel = 'Get Full page (Selected)',
  captureIssues = [],
  onOpenImageReport,
  showImageMenu,
  imageMenuRef,
  hasSelection,
  canUndo,
  canRedo,
  undoRedoDisabledReason = '',
  onUndo,
  onRedo,
  onClearCanvas,
  onSaveMap,
  isSavingMap = false,
  onDuplicateMap,
  onShowVersionHistory,
  onExport,
  onShare,
  canOpenShare = false,
  hasMap,
  hasSavedMap,
  showVersionHistory,
  shareDisabledReason = '',
  onBlockedShareAttempt,
}) => {
  const undoBlockedByLive = !canUndo && !!undoRedoDisabledReason;
  const redoBlockedByLive = !canRedo && !!undoRedoDisabledReason;
  const shareUnavailable = !hasSavedMap;

  return (
  <div className="canvas-toolbar" data-feedback-id="canvas-toolbar" data-feedback-label="Canvas toolbar">
    <ToolButton
      active={activeTool === 'select' && !connectionTool}
      onClick={onSelectTool}
      icon={<MousePointer2 />}
      label="Select"
      title="Select (V)"
    />
    {canEdit && (
      <ToolButton
        active={connectionTool === 'userflow'}
        onClick={onToggleUserFlow}
        icon={<Workflow />}
        label="User Flow"
        title="User Flow (F)"
      />
    )}
    {canEdit && (
      <ToolButton
        active={connectionTool === 'crosslink'}
        onClick={onToggleCrosslink}
        icon={<Link2 />}
        label="Crosslink"
        title="Crosslink (L)"
      />
    )}

    <div className="canvas-toolbar-divider" />

    <div className="canvas-tool-menu-wrapper" ref={imageMenuRef}>
      <ToolButton
        active={showImageMenu}
        onClick={onToggleImageMenu}
        icon={<Image />}
        label="Images"
        title="Images"
        disabled={!hasMap}
      />
      {showImageMenu && (
        <MenuPanel
          className="canvas-tool-menu canvas-tool-menu-images"
          role="menu"
          onWheel={containMenuScroll}
          onWheelCapture={containMenuScroll}
          onTouchMove={containMenuScroll}
          onTouchMoveCapture={containMenuScroll}
        >
          {hasAnyThumbnails && (
            <>
              <MenuItem
                className="canvas-tool-menu-toggle"
                label="View screenshots"
                endSlot={showThumbnails ? <Eye size={16} /> : <EyeOff size={16} />}
                onClick={onToggleThumbnails}
              />
              <MenuDivider className="canvas-tool-menu-divider" />
            </>
          )}
          <div className="canvas-tool-menu-section">
            <MenuSectionHeader className="canvas-tool-menu-label">Visible area</MenuSectionHeader>
            <MenuItem
              className="canvas-tool-menu-item"
              label={thumbnailsAllLabel}
              onClick={onGetThumbnailsAll}
              disabled={!hasMap}
            />
            <MenuItem
              className="canvas-tool-menu-item"
              label={thumbnailsSelectedLabel}
              onClick={onGetThumbnailsSelected}
              disabled={!hasSelection || !hasMap}
            />
            <MenuItem
              className="canvas-tool-menu-item"
              label="Update Captured Visible area"
              onClick={onUpdateCapturedThumbnails}
              disabled={!hasMap || !hasDownloadableThumbnails}
            />
          </div>
          <MenuDivider className="canvas-tool-menu-divider" />
          <div className="canvas-tool-menu-section">
            <MenuSectionHeader className="canvas-tool-menu-label">Full page</MenuSectionHeader>
            <MenuItem
              className="canvas-tool-menu-item"
              label={fullScreenshotsAllLabel}
              onClick={onGetFullScreenshotsAll}
              disabled={!hasMap}
            />
            <MenuItem
              className="canvas-tool-menu-item"
              label={fullScreenshotsSelectedLabel}
              onClick={onGetFullScreenshotsSelected}
              disabled={!hasSelection || !hasMap}
            />
            <MenuItem
              className="canvas-tool-menu-item"
              label="Update Captured Full page"
              onClick={onUpdateCapturedFullScreenshots}
              disabled={!hasMap || !hasFullScreenshotAssets}
            />
          </div>
          <MenuDivider className="canvas-tool-menu-divider" />
          <MenuItem
            className="canvas-tool-menu-item canvas-tool-menu-report-item"
            label="Image report"
            badge={captureIssues.length > 0 ? `${captureIssues.length}` : null}
            onClick={onOpenImageReport}
          />
          <MenuDivider className="canvas-tool-menu-divider canvas-tool-menu-download-divider" />
          <div className="canvas-tool-menu-section canvas-tool-menu-download-section">
            <MenuItem
              className="canvas-tool-menu-item"
              label="Download All"
              onClick={onDownloadImagesAll}
              disabled={!hasMap || !hasDownloadableImages}
            />
            <MenuItem
              className="canvas-tool-menu-item"
              label="Download Selected"
              onClick={onDownloadImagesSelected}
              disabled={!hasSelection || !hasDownloadableSelectedImages}
            />
          </div>
        </MenuPanel>
      )}
    </div>

    <ToolButton
      active={showCommentsPanel}
      onClick={onToggleCommentsPanel}
      icon={<MessageSquare />}
      label="Comments"
      title="Comments (C)"
      disabled={!canViewComments}
    >
      {hasUnreadCommentMentions && canViewComments && <span className="notification-dot" />}
    </ToolButton>
    <ToolButton
      active={showReportDrawer}
      onClick={onToggleReportDrawer}
      icon={<GanttChartSquare />}
      label="Report"
      title="Report (R)"
    />
    <div className="canvas-toolbar-divider" />
    <div className="canvas-tool-menu-wrapper" ref={layersMenuRef}>
      <ToolButton
        active={showLayersMenu}
        onClick={onToggleLayersMenu}
        icon={<Layers />}
        label="Layers"
        title="Layers"
        disabled={!hasMap}
      />
      {showLayersMenu && (
        <MenuPanel className="canvas-tool-menu canvas-tool-menu-panel" role="menu">
          {layersPanel}
        </MenuPanel>
      )}
    </div>
    <div className="canvas-tool-menu-wrapper" ref={legendMenuRef}>
      <ToolButton
        active={showLegendMenu}
        onClick={onToggleLegendMenu}
        icon={<Palette />}
        label="Legend"
        title="Legend"
        disabled={!hasMap}
      />
      {showLegendMenu && (
        <MenuPanel className="canvas-tool-menu canvas-tool-menu-panel" role="menu">
          {legendPanel}
        </MenuPanel>
      )}
    </div>

    {canEdit && <div className="canvas-toolbar-divider" />}

    {canEdit && (
      <ToolButton
        className={!canUndo ? 'disabled' : ''}
        onClick={canUndo || undoBlockedByLive ? onUndo : undefined}
        disabled={!canUndo && !undoBlockedByLive}
        aria-disabled={!canUndo}
        icon={<Undo2 />}
        label="Undo"
        title={!canUndo && undoRedoDisabledReason ? undoRedoDisabledReason : 'Undo (⌘Z)'}
      />
    )}
    {canEdit && (
      <ToolButton
        className={!canRedo ? 'disabled' : ''}
        onClick={canRedo || redoBlockedByLive ? onRedo : undefined}
        disabled={!canRedo && !redoBlockedByLive}
        aria-disabled={!canRedo}
        icon={<Redo2 />}
        label="Redo"
        title={!canRedo && undoRedoDisabledReason ? undoRedoDisabledReason : 'Redo (⇧⌘Z)'}
      />
    )}
    {canEdit && (
      <ToolButton
        onClick={onClearCanvas}
        disabled={!hasMap}
        icon={<RefreshCcw />}
        label="Clear Canvas"
        title="Clear Canvas"
      />
    )}

    {canEdit && <div className="canvas-toolbar-divider" />}

    {canEdit && (
      <ToolButton
        title="Add Page"
        onClick={onAddPage}
        icon={<FilePlus />}
        label="Add Page"
      />
    )}

    {canEdit && !hasSavedMap && (
      <ToolButton
        className={isSavingMap ? 'is-saving' : ''}
        onClick={onSaveMap}
        disabled={!hasMap || isSavingMap}
        icon={isSavingMap ? <Loader2 className="spin" /> : <Bookmark />}
        label={isSavingMap ? 'Saving' : 'Save Map'}
        title={isSavingMap ? 'Saving' : 'Save Map'}
      >
        {isSavingMap ? 'Saving' : null}
      </ToolButton>
    )}

    {canEdit && hasSavedMap && (
      <ToolButton
        onClick={onDuplicateMap}
        disabled={!hasMap}
        icon={<CopyPlus />}
        label="Duplicate Map"
        title="Duplicate Map"
      />
    )}

    <div className="canvas-toolbar-divider" />

    {canViewVersionHistory && hasMap && (
      <ToolButton
        active={showVersionHistory}
        onClick={onShowVersionHistory}
        icon={<History />}
        label="Version History"
        title={hasSavedMap ? 'Version History (H)' : 'Version History'}
      />
    )}

    <ToolButton
      onClick={onExport}
      disabled={!hasMap}
      icon={<Download />}
      label="Download"
      title="Download"
    />

    {canOpenShare && (
      <ToolButton
        className={shareUnavailable ? 'disabled' : ''}
        onClick={shareUnavailable ? onBlockedShareAttempt : onShare}
        icon={<Share2 />}
        label="Share"
        title={shareUnavailable ? shareDisabledReason : 'Share'}
        aria-disabled={shareUnavailable}
      />
    )}
  </div>
  );
};

export default CanvasToolbar;
