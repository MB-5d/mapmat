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
  Link2,
  MessageSquare,
  MousePointer2,
  RefreshCcw,
  Redo2,
  Share2,
  Undo2,
  Workflow,
} from 'lucide-react';

const CanvasToolbar = ({
  canEdit,
  activeTool,
  connectionTool,
  onSelectTool,
  onAddPage,
  onToggleUserFlow,
  onToggleCrosslink,
  showCommentsPanel,
  onToggleCommentsPanel,
  hasAnyComments,
  showReportDrawer,
  onToggleReportDrawer,
  onToggleImageMenu,
  onGetThumbnailsAll,
  onGetThumbnailsSelected,
  onToggleThumbnails,
  showThumbnails,
  hasAnyThumbnails,
  allThumbnailsCaptured,
  showImageMenu,
  imageMenuRef,
  hasSelection,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClearCanvas,
  onSaveMap,
  onDuplicateMap,
  onShowVersionHistory,
  onExport,
  onShare,
  hasMap,
  hasSavedMap,
  showVersionHistory,
}) => (
  <div className="canvas-toolbar">
    <button
      className={`canvas-tool-btn ${activeTool === 'select' && !connectionTool ? 'active' : ''}`}
      onClick={onSelectTool}
      title="Select (V)"
    >
      <MousePointer2 size={20} />
    </button>
    {canEdit && (
      <button
        className="canvas-tool-btn"
        title="Add Page"
        onClick={onAddPage}
      >
        <FilePlus size={20} />
      </button>
    )}

    {canEdit && <div className="canvas-toolbar-divider" />}

    {canEdit && (
      <button
        className={`canvas-tool-btn ${connectionTool === 'userflow' ? 'active' : ''}`}
        onClick={onToggleUserFlow}
        title="User Flow (F)"
      >
        <Workflow size={20} />
      </button>
    )}
    {canEdit && (
      <button
        className={`canvas-tool-btn ${connectionTool === 'crosslink' ? 'active' : ''}`}
        onClick={onToggleCrosslink}
        title="Crosslink (L)"
      >
        <Link2 size={20} />
      </button>
    )}
    <button
      className={`canvas-tool-btn ${showCommentsPanel ? 'active' : ''}`}
      onClick={onToggleCommentsPanel}
      title="Comments (C)"
    >
      <MessageSquare size={20} />
      {hasAnyComments && <span className="notification-dot" />}
    </button>
    <button
      className={`canvas-tool-btn ${showReportDrawer ? 'active' : ''}`}
      onClick={onToggleReportDrawer}
      title="Report (R)"
    >
      <GanttChartSquare size={20} />
    </button>

    <div className="canvas-tool-menu-wrapper" ref={imageMenuRef}>
      <button
        className={`canvas-tool-btn ${showImageMenu ? 'active' : ''}`}
        onClick={onToggleImageMenu}
        title="Images"
        disabled={!hasMap}
      >
        <Image size={20} />
      </button>
      {showImageMenu && (
        <div className="canvas-tool-menu" role="menu">
          {hasAnyThumbnails && (
            <>
              <button
                className="canvas-tool-menu-toggle"
                onClick={onToggleThumbnails}
                type="button"
              >
                <span>View thumbnails</span>
                <span className="canvas-tool-menu-toggle-icon">
                  {showThumbnails ? <Eye size={16} /> : <EyeOff size={16} />}
                </span>
              </button>
              <div className="canvas-tool-menu-divider" />
            </>
          )}
          <div className="canvas-tool-menu-section">
            <div className="canvas-tool-menu-label">Thumbnails</div>
            <button
              className="canvas-tool-menu-item"
              onClick={onGetThumbnailsAll}
              disabled={!hasMap || allThumbnailsCaptured}
            >
              Get thumbnails (All)
            </button>
            <button
              className="canvas-tool-menu-item"
              onClick={onGetThumbnailsSelected}
              disabled={!hasSelection || !hasMap}
            >
              Get thumbnails (Selected)
            </button>
          </div>
          <div className="canvas-tool-menu-divider" />
          <div className="canvas-tool-menu-section">
            <div className="canvas-tool-menu-label">Full screenshots</div>
            <button className="canvas-tool-menu-item disabled" disabled>
              Get full screenshots (All)
            </button>
            <button className="canvas-tool-menu-item disabled" disabled>
              Get full screenshots (Selected)
            </button>
            <div className="canvas-tool-menu-hint">Coming soon</div>
          </div>
        </div>
      )}
    </div>

    {canEdit && <div className="canvas-toolbar-divider" />}

    {canEdit && (
      <button
        className={`canvas-tool-btn ${!canUndo ? 'disabled' : ''}`}
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
      >
        <Undo2 size={20} />
      </button>
    )}
    {canEdit && (
      <button
        className={`canvas-tool-btn ${!canRedo ? 'disabled' : ''}`}
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (⇧⌘Z)"
      >
        <Redo2 size={20} />
      </button>
    )}

    {canEdit && (
      <button
        className={`canvas-tool-btn ${!hasMap ? 'disabled' : ''}`}
        onClick={onClearCanvas}
        disabled={!hasMap}
        title="Clear Canvas"
      >
        <RefreshCcw size={20} />
      </button>
    )}

    <div className="canvas-toolbar-divider" />

    {canEdit && !hasSavedMap && (
      <button
        className="canvas-tool-btn"
        onClick={onSaveMap}
        disabled={!hasMap}
        title="Save Map"
      >
        <Bookmark size={20} />
      </button>
    )}

    {canEdit && hasSavedMap && (
      <button
        className="canvas-tool-btn"
        onClick={onDuplicateMap}
        disabled={!hasMap}
        title="Duplicate Map"
      >
        <CopyPlus size={20} />
      </button>
    )}

    {canEdit && hasMap && (
      <button
        className={`canvas-tool-btn ${showVersionHistory ? 'active' : ''}`}
        onClick={onShowVersionHistory}
        title={hasSavedMap ? 'Version History (H)' : 'Version History (draft, save map to persist)'}
      >
        <History size={20} />
      </button>
    )}

    <button
      className="canvas-tool-btn"
      onClick={onExport}
      disabled={!hasMap}
      title="Download"
    >
      <Download size={20} />
    </button>

    {canEdit && (
      <button
        className="canvas-tool-btn"
        onClick={onShare}
        disabled={!hasMap}
        title="Share"
      >
        <Share2 size={20} />
      </button>
    )}
  </div>
);

export default CanvasToolbar;
