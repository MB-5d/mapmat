import React from 'react';
import {
  Bookmark,
  Copy,
  Download,
  FilePlus,
  GanttChartSquare,
  History,
  Image,
  ImagePlus,
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
  createLucideIcon,
} from 'lucide-react';

import IconButton from '../ui/IconButton';
import Button from '../ui/Button';
import {
  MenuDivider,
  MenuItem,
  MenuPanel,
  MenuSection,
  MenuSectionHeader,
  MenuTitle,
} from '../ui/Menu';

const UserRoundPlus = createLucideIcon('UserRoundPlus', [
  ['path', { d: 'M2 21a8 8 0 0 1 13.292-6', key: '1n5e0e' }],
  ['circle', { cx: '10', cy: '8', r: '5', key: '1ypgyx' }],
  ['path', { d: 'M19 16v6', key: 'tddt3s' }],
  ['path', { d: 'M22 19h-6', key: 'y42fxk' }],
]);

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
  thumbnailsAllLabel = 'Get thumbnails (all)',
  thumbnailsSelectedLabel = 'Get thumbnails (selected)',
  fullScreenshotsAllLabel = 'Get full page (all)',
  fullScreenshotsSelectedLabel = 'Get full page (selected)',
  captureIssues = [],
  onOpenImageReport,
  screenshotCreditsLabel = '0',
  onAddScreenshotCredits,
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
  onCollaborate,
  canOpenShare = false,
  canOpenCollaborate = false,
  canUseImageTools = true,
  hasMap,
  hasSavedMap,
  showVersionHistory,
  shareDisabledReason = '',
  onBlockedShareAttempt,
}) => {
  const undoBlockedByLive = !canUndo && !!undoRedoDisabledReason;
  const redoBlockedByLive = !canRedo && !!undoRedoDisabledReason;
  const shareUnavailable = !hasSavedMap;
  const imageCaptureRequiresSave = hasMap && !hasSavedMap;
  const imageCaptureDisabled = !hasMap || imageCaptureRequiresSave;
  const imageCaptureDisabledReason = imageCaptureRequiresSave ? IMAGE_CAPTURE_SAVE_REQUIRED_MESSAGE : undefined;
  const selectionRequiredReason = imageCaptureDisabledReason || (!hasSelection ? 'Select pages first' : undefined);
  const canUseImageCaptureTools = !!canUseImageTools;
  const showVisibilitySection = hasAnyThumbnails && !!onToggleThumbnails;
  const showVisibleAreaAllAction = canUseImageCaptureTools && !!onGetThumbnailsAll;
  const showVisibleAreaSelectedAction = canUseImageCaptureTools && !!onGetThumbnailsSelected;
  const showVisibleAreaUpdateAction = canUseImageCaptureTools && hasDownloadableThumbnails && !!onUpdateCapturedThumbnails;
  const showVisibleAreaSection = showVisibleAreaAllAction
    || showVisibleAreaSelectedAction
    || showVisibleAreaUpdateAction;
  const showFullPageAllAction = canUseImageCaptureTools && !!onGetFullScreenshotsAll;
  const showFullPageSelectedAction = canUseImageCaptureTools && !!onGetFullScreenshotsSelected;
  const showFullPageUpdateAction = canUseImageCaptureTools && hasFullScreenshotAssets && !!onUpdateCapturedFullScreenshots;
  const showFullPageSection = showFullPageAllAction
    || showFullPageSelectedAction
    || showFullPageUpdateAction;
  const showImageReportSection = canUseImageCaptureTools && captureIssues.length > 0 && !!onOpenImageReport;
  const showDownloadAllAction = canUseImageCaptureTools && hasDownloadableImages && !!onDownloadImagesAll;
  const showDownloadSelectedAction = canUseImageCaptureTools && hasSelection && hasDownloadableSelectedImages && !!onDownloadImagesSelected;
  const showDownloadSection = showDownloadAllAction || showDownloadSelectedAction;
  const imageMenuSections = [
    showVisibilitySection ? {
      key: 'visibility',
      content: (
        <MenuSection>
          <MenuSectionHeader className="canvas-tool-menu-label">Visibility</MenuSectionHeader>
          <MenuItem
            className="canvas-tool-menu-toggle"
            label="Node thumbnails"
            endSlot={showThumbnails ? <Eye size={16} /> : <EyeOff size={16} />}
            onClick={onToggleThumbnails}
          />
        </MenuSection>
      ),
    } : null,
    showVisibleAreaSection ? {
      key: 'visible-area',
      content: (
        <MenuSection className="canvas-tool-menu-section">
          <MenuSectionHeader className="canvas-tool-menu-label">Capture visible area</MenuSectionHeader>
          {showVisibleAreaAllAction ? (
            <MenuItem
              className="canvas-tool-menu-item"
              label={thumbnailsAllLabel}
              onClick={onGetThumbnailsAll}
              disabled={imageCaptureDisabled}
              title={imageCaptureDisabledReason}
            />
          ) : null}
          {showVisibleAreaSelectedAction ? (
            <MenuItem
              className="canvas-tool-menu-item"
              label={thumbnailsSelectedLabel}
              onClick={onGetThumbnailsSelected}
              disabled={imageCaptureDisabled || !hasSelection}
              title={selectionRequiredReason}
            />
          ) : null}
          {showVisibleAreaUpdateAction ? (
            <MenuItem
              className="canvas-tool-menu-item"
              label="Update captured thumbnails"
              onClick={onUpdateCapturedThumbnails}
              disabled={imageCaptureDisabled}
              title={imageCaptureDisabledReason}
            />
          ) : null}
        </MenuSection>
      ),
    } : null,
    showFullPageSection ? {
      key: 'full-page',
      content: (
        <MenuSection className="canvas-tool-menu-section">
          <MenuSectionHeader className="canvas-tool-menu-label">Capture full page</MenuSectionHeader>
          {showFullPageAllAction ? (
            <MenuItem
              className="canvas-tool-menu-item"
              label={fullScreenshotsAllLabel}
              onClick={onGetFullScreenshotsAll}
              disabled={imageCaptureDisabled}
              title={imageCaptureDisabledReason}
            />
          ) : null}
          {showFullPageSelectedAction ? (
            <MenuItem
              className="canvas-tool-menu-item"
              label={fullScreenshotsSelectedLabel}
              onClick={onGetFullScreenshotsSelected}
              disabled={imageCaptureDisabled || !hasSelection}
              title={selectionRequiredReason}
            />
          ) : null}
          {showFullPageUpdateAction ? (
            <MenuItem
              className="canvas-tool-menu-item"
              label="Update captured full page"
              onClick={onUpdateCapturedFullScreenshots}
              disabled={imageCaptureDisabled}
              title={imageCaptureDisabledReason}
            />
          ) : null}
        </MenuSection>
      ),
    } : null,
    showImageReportSection ? {
      key: 'review',
      content: (
        <MenuSection className="canvas-tool-menu-section">
          <MenuSectionHeader className="canvas-tool-menu-label">Review</MenuSectionHeader>
          <MenuItem
            className="canvas-tool-menu-item canvas-tool-menu-report-item"
            label="Image report"
            badge={`${captureIssues.length}`}
            onClick={onOpenImageReport}
          />
        </MenuSection>
      ),
    } : null,
    showDownloadSection ? {
      key: 'download',
      content: (
        <MenuSection className="canvas-tool-menu-section canvas-tool-menu-download-section">
          <MenuSectionHeader className="canvas-tool-menu-label">Download</MenuSectionHeader>
          {showDownloadAllAction ? (
            <MenuItem
              className="canvas-tool-menu-item"
              label="Download all"
              onClick={onDownloadImagesAll}
              disabled={!hasSavedMap || !hasMap}
            />
          ) : null}
          {showDownloadSelectedAction ? (
            <MenuItem
              className="canvas-tool-menu-item"
              label="Download selected"
              onClick={onDownloadImagesSelected}
              disabled={!hasSavedMap}
              title={!hasSavedMap ? imageCaptureDisabledReason : undefined}
            />
          ) : null}
        </MenuSection>
      ),
    } : null,
  ].filter(Boolean);

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
      label="User flow"
      title="User flow (F)"
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
      title="Add page"
      onClick={onAddPage}
      icon={<FilePlus />}
      label="Add page"
    />
  ) : null;

  const duplicateButton = canEdit && hasSavedMap ? (
    <ToolButton
      key="duplicate-map"
      onClick={onDuplicateMap}
      disabled={!hasMap}
      icon={<Copy />}
      label="Duplicate map"
      title="Duplicate map"
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

  const commentsButton = canViewComments ? (
    <ToolButton
      key="comments"
      active={showCommentsPanel}
      onClick={onToggleCommentsPanel}
      icon={<MessageSquare />}
      label="Comments"
      title="Comments (C)"
    >
      {hasUnreadCommentMentions && <span className="notification-dot" />}
    </ToolButton>
  ) : null;

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
      label="Version history"
      title={hasSavedMap ? 'Version history (H)' : 'Version history'}
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
          <div
            className="canvas-tool-menu-images-scroll"
            onWheel={containMenuScroll}
            onWheelCapture={containMenuScroll}
            onTouchMove={containMenuScroll}
            onTouchMoveCapture={containMenuScroll}
          >
            <MenuTitle>Images</MenuTitle>
            {canUseImageCaptureTools && imageCaptureRequiresSave && (
              <div className="canvas-tool-menu-hint" role="note">
                {IMAGE_CAPTURE_SAVE_REQUIRED_MESSAGE}
              </div>
            )}
            {imageMenuSections.map((section) => (
              <React.Fragment key={section.key}>
                {section.content}
              </React.Fragment>
            ))}
          </div>
          {canUseImageCaptureTools ? (
            <>
              <MenuDivider className="canvas-tool-menu-divider canvas-tool-menu-credits-divider" />
              <div className="canvas-tool-menu-credits" role="note">
                <span className="canvas-tool-menu-credits-copy">
                  Screenshot credits remaining: <strong>{screenshotCreditsLabel}</strong>
                </span>
                <Button
                  type="link"
                  size="sm"
                  className="canvas-tool-menu-credits-button"
                  startIcon={<ImagePlus />}
                  onClick={() => onAddScreenshotCredits?.()}
                >
                  Add credits
                </Button>
              </div>
            </>
          ) : null}
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

  const saveButton = canEdit && !hasSavedMap ? (
    <ToolButton
      key="save-map"
      className={isSavingMap ? 'is-saving' : ''}
      onClick={onSaveMap}
      disabled={!hasMap || isSavingMap}
      icon={isSavingMap ? <Loader2 className="spin" /> : <Bookmark />}
      label={isSavingMap ? 'Saving' : 'Save map'}
      title={isSavingMap ? 'Saving' : 'Save map'}
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
      label="Clear canvas"
      title="Clear canvas"
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

  const collaborateButton = canOpenCollaborate ? (
    <ToolButton
      key="collaborate"
      className={shareUnavailable ? 'disabled' : ''}
      onClick={shareUnavailable ? onBlockedShareAttempt : onCollaborate}
      icon={<UserRoundPlus className="lucide-user-round-plus" />}
      label="Collaborate"
      title="Collaborate"
      aria-disabled={shareUnavailable}
    />
  ) : null;

  const sections = [
    [selectButton, userFlowButton, crosslinkButton].filter(Boolean),
    canEdit ? [addPageButton, duplicateButton].filter(Boolean) : [],
    canEdit ? [undoButton, redoButton].filter(Boolean) : [],
    [commentsButton, reportButton, historyButton].filter(Boolean),
    [imageMenuButton, layersButton, legendButton].filter(Boolean),
    [saveButton, clearCanvasButton, exportButton, shareButton, collaborateButton].filter(Boolean),
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
