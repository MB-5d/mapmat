import React from 'react';
import {
  Bookmark,
  Download,
  FilePlus,
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
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClearCanvas,
  onSaveMap,
  onExport,
  onShare,
  hasMap,
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

    {canEdit && (
      <button
        className="canvas-tool-btn"
        onClick={onSaveMap}
        disabled={!hasMap}
        title="Save Map"
      >
        <Bookmark size={20} />
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
