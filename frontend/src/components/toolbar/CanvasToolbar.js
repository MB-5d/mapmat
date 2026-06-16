import React from 'react';
import {
  ArrowDownFromLine,
  ArrowRightFromLine,
  Bookmark,
  Copy,
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
  Ratio,
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
      size="xs"
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

const IMAGE_CAPTURE_SAVE_REQUIRED_MESSAGE = 'Save this map before capturing screenshots.';

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
  mapOrientation = 'vertical',
  showOrientationMenu,
  onToggleOrientationMenu,
  orientationMenuRef,
  onMapOrientationChange,
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
  thumbnailsAllLabel = 'Get Thumbnails (All)',
  thumbnailsSelectedLabel = 'Get Thumbnails (Selected)',
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
  const isHorizontalOrientation = mapOrientation === 'horizontal';
  const orientationLabel = `Orientation: ${isHorizontalOrientation ? 'Horizontal' : 'Vertical'}`;
  const imageCaptureRequiresSave = hasMap && !hasSavedMap;
  const imageCaptureDisabled = !hasMap || imageCaptureRequiresSave;
  const imageCaptureDisabledReason = imageCaptureRequiresSave ? IMAGE_CAPTURE_SAVE_REQUIRED_MESSAGE : undefined;
  const selectionRequiredReason = imageCaptureDisabledReason || (!hasSelection ? 'Select pages first' : undefined);

  const selectButton = (
    <ToolButton
      key="select"
      active={activeTool === 'select' && !connectionTool}
      onClick={onSelectTool}
      icon={<MousePointer2 />}
      label="Select"
      title="Select (V)"
    />
  );

  const userFlowButton = canEdit ? (
    <ToolButton
      key="userflow"
      active={connectionTool === 'userflow'}
      onClick={onToggleUserFlow}
      icon={<Workflow />}
      label="User Flow"
      title="User Flow (F)"
    />
  ) : null;

  const crosslinkButton = canEdit ? (
    <ToolButton
      key="crosslink"
      active={connectionTool === 'crosslink'}
      onClick={onToggleCrosslink}
      icon={<Link2 />}
      label="Crosslink"
      title="Crosslink (L)"
    />
  ) : null;

  const addPageButton = canEdit ? (
    <ToolButton
      key="add-page"
      title="Add Page"
      onClick={onAddPage}
      icon={<FilePlus />}
      label="Add Page"
    />
  ) : null;

  const duplicateButton = canEdit && hasSavedMap ? (
    <ToolButton
      key="duplicate-map"
      onClick={onDuplicateMap}
      disabled={!hasMap}
      icon={<Copy />}
      label="Duplicate Map"
      title="Duplicate Map"
    />
  ) : null;

  const undoButton = canEdit ? (
    <ToolButton
      key="undo"
      className={!canUndo ? 'disabled' : ''}
      onClick={canUndo || undoBlockedByLive ? onUndo : undefined}
      disabled={!canUndo && !undoBlockedByLive}
      aria-disabled={!canUndo}
      icon={<Undo2 />}
      label="Undo"
      title={!canUndo && undoRedoDisabledReason ? undoRedoDisabledReason : 'Undo (⌘Z)'}
    />
  ) : null;

  const redoButton = canEdit ? (
    <ToolButton
      key="redo"
      className={!canRedo ? 'disabled' : ''}
      onClick={canRedo || redoBlockedByLive ? onRedo : undefined}
      disabled={!canRedo && !redoBlockedByLive}
      aria-disabled={!canRedo}
      icon={<Redo2 />}
      label="Redo"
      title={!canRedo && undoRedoDisabledReason ? undoRedoDisabledReason : 'Redo (⇧⌘Z)'}
    />
  ) : null;

  const commentsButton = (
    <ToolButton
      key="comments"
      active={showCommentsPanel}
      onClick={onToggleCommentsPanel}
      icon={<MessageSquare />}
      label="Comments"
      title="Comments (C)"
      disabled={!canViewComments}
    >
      {hasUnreadCommentMentions && canViewComments && <span className="notification-dot" />}
    </ToolButton>
  );

  const reportButton = (
    <ToolButton
      key="report"
      active={showReportDrawer}
      onClick={onToggleReportDrawer}
      icon={<GanttChartSquare />}
      label="Report"
      title="Report (R)"
    />
  );

  const historyButton = canViewVersionHistory && hasMap ? (
    <ToolButton
      key="version-history"
      active={showVersionHistory}
      onClick={onShowVersionHistory}
      icon={<History />}
      label="Version History"
      title={hasSavedMap ? 'Version History (H)' : 'Version History'}
    />
  ) : null;

  const imageMenuButton = (
    <div key="images-menu" className="canvas-tool-menu-wrapper" ref={imageMenuRef}>
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
          {imageCaptureRequiresSave && (
            <div className="canvas-tool-menu-hint" role="note">
              {IMAGE_CAPTURE_SAVE_REQUIRED_MESSAGE}
            </div>
          )}
          <div className="canvas-tool-menu-section">
            <MenuSectionHeader className="canvas-tool-menu-label">Thumbnails (visible area)</MenuSectionHeader>
            <MenuItem
              className="canvas-tool-menu-item"
              label={thumbnailsAllLabel}
              onClick={onGetThumbnailsAll}
              disabled={imageCaptureDisabled}
              title={imageCaptureDisabledReason}
            />
            <MenuItem
              className="canvas-tool-menu-item"
              label={thumbnailsSelectedLabel}
              onClick={onGetThumbnailsSelected}
              disabled={imageCaptureDisabled || !hasSelection}
              title={selectionRequiredReason}
            />
            <MenuItem
              className="canvas-tool-menu-item"
              label="Update Captured Thumbnails"
              onClick={onUpdateCapturedThumbnails}
              disabled={imageCaptureDisabled || !hasDownloadableThumbnails}
              title={imageCaptureDisabledReason}
            />
          </div>
          <MenuDivider className="canvas-tool-menu-divider" />
          <div className="canvas-tool-menu-section">
            <MenuSectionHeader className="canvas-tool-menu-label">Full page</MenuSectionHeader>
            <MenuItem
              className="canvas-tool-menu-item"
              label={fullScreenshotsAllLabel}
              onClick={onGetFullScreenshotsAll}
              disabled={imageCaptureDisabled}
              title={imageCaptureDisabledReason}
            />
            <MenuItem
              className="canvas-tool-menu-item"
              label={fullScreenshotsSelectedLabel}
              onClick={onGetFullScreenshotsSelected}
              disabled={imageCaptureDisabled || !hasSelection}
              title={selectionRequiredReason}
            />
            <MenuItem
              className="canvas-tool-menu-item"
              label="Update Captured Full page"
              onClick={onUpdateCapturedFullScreenshots}
              disabled={imageCaptureDisabled || !hasFullScreenshotAssets}
              title={imageCaptureDisabledReason}
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
              disabled={!hasSavedMap || !hasMap || !hasDownloadableImages}
            />
            <MenuItem
              className="canvas-tool-menu-item"
              label="Download Selected"
              onClick={onDownloadImagesSelected}
              disabled={!hasSavedMap || !hasSelection || !hasDownloadableSelectedImages}
              title={!hasSavedMap ? imageCaptureDisabledReason : (!hasSelection ? 'Select pages first' : undefined)}
            />
          </div>
        </MenuPanel>
      )}
    </div>
  );

  const layersButton = (
    <div key="layers-menu" className="canvas-tool-menu-wrapper" ref={layersMenuRef}>
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
  );

  const legendButton = (
    <div key="legend-menu" className="canvas-tool-menu-wrapper" ref={legendMenuRef}>
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
  );

  const orientationButton = (
    <div key="orientation-menu" className="canvas-tool-menu-wrapper" ref={orientationMenuRef}>
      <ToolButton
        active={showOrientationMenu}
        onClick={onToggleOrientationMenu}
        icon={<Ratio />}
        label="Orientation"
        title={orientationLabel}
        disabled={!hasMap}
        aria-expanded={showOrientationMenu}
        aria-haspopup="menu"
      />
      {showOrientationMenu && (
        <MenuPanel className="canvas-tool-menu canvas-tool-menu-panel" role="menu">
          <MenuSectionHeader className="canvas-tool-menu-label">Orientation</MenuSectionHeader>
          <MenuItem
            className="canvas-tool-menu-item"
            icon={<ArrowDownFromLine size={16} />}
            label="Vertical"
            selected={!isHorizontalOrientation}
            role="menuitemradio"
            aria-checked={!isHorizontalOrientation}
            onClick={() => onMapOrientationChange?.('vertical')}
          />
          <MenuItem
            className="canvas-tool-menu-item"
            icon={<ArrowRightFromLine size={16} />}
            label="Horizontal"
            selected={isHorizontalOrientation}
            role="menuitemradio"
            aria-checked={isHorizontalOrientation}
            onClick={() => onMapOrientationChange?.('horizontal')}
          />
        </MenuPanel>
      )}
    </div>
  );

  const saveButton = canEdit && !hasSavedMap ? (
    <ToolButton
      key="save-map"
      className={isSavingMap ? 'is-saving' : ''}
      onClick={onSaveMap}
      disabled={!hasMap || isSavingMap}
      icon={isSavingMap ? <Loader2 className="spin" /> : <Bookmark />}
      label={isSavingMap ? 'Saving' : 'Save Map'}
      title={isSavingMap ? 'Saving' : 'Save Map'}
    >
      {isSavingMap ? 'Saving' : null}
    </ToolButton>
  ) : null;

  const clearCanvasButton = canEdit ? (
    <ToolButton
      key="clear-canvas"
      onClick={onClearCanvas}
      disabled={!hasMap}
      icon={<RefreshCcw />}
      label="Clear Canvas"
      title="Clear Canvas"
    />
  ) : null;

  const exportButton = (
    <ToolButton
      key="download"
      onClick={onExport}
      disabled={!hasMap}
      icon={<Download />}
      label="Download"
      title="Download"
    />
  );

  const shareButton = canOpenShare ? (
    <ToolButton
      key="share"
      className={shareUnavailable ? 'disabled' : ''}
      onClick={shareUnavailable ? onBlockedShareAttempt : onShare}
      icon={<Share2 />}
      label="Share"
      title={shareUnavailable ? shareDisabledReason : 'Share'}
      aria-disabled={shareUnavailable}
    />
  ) : null;

  const sections = [
    [selectButton, userFlowButton, crosslinkButton].filter(Boolean),
    canEdit ? [addPageButton, duplicateButton].filter(Boolean) : [],
    canEdit ? [undoButton, redoButton].filter(Boolean) : [],
    [commentsButton, reportButton, historyButton].filter(Boolean),
    [imageMenuButton, layersButton, legendButton, orientationButton].filter(Boolean),
    [saveButton, clearCanvasButton, exportButton, shareButton].filter(Boolean),
  ].filter((section) => section.length > 0);

  return (
    <div className="canvas-toolbar" data-feedback-id="canvas-toolbar" data-feedback-label="Canvas toolbar">
      {sections.map((section, index) => (
        <React.Fragment key={`section-${index}`}>
          {index > 0 && <div className="canvas-toolbar-divider" />}
          {section}
        </React.Fragment>
      ))}
    </div>
  );
};

export default CanvasToolbar;
