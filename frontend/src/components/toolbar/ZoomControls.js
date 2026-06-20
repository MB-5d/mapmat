import React from 'react';
import { Locate, PanelBottom, ZoomIn, ZoomOut } from 'lucide-react';

import IconButton from '../ui/IconButton';

const ZoomControls = ({
  scale,
  minScale = 0.1,
  maxScale = 2,
  onZoomOut,
  onZoomIn,
  onResetView,
  onToggleMinimap,
  showMinimap,
}) => {
  const safeScale = Number.isFinite(scale) ? scale : 1;

  return (
    <div className="zoom-controls">
      <IconButton
        size="xxs"
        variant="ghost"
        buttonStyle="mono"
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
        disabled={safeScale <= minScale + 0.001}
      >
        <ZoomOut size={18} />
      </IconButton>
      <span className="zoom-level">{Math.round(safeScale * 100)}%</span>
      <IconButton
        size="xxs"
        variant="ghost"
        buttonStyle="mono"
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
        disabled={safeScale >= maxScale - 0.001}
      >
        <ZoomIn size={18} />
      </IconButton>
      <div className="zoom-divider" />
      <IconButton
        size="xxs"
        variant="ghost"
        buttonStyle="mono"
        onClick={onToggleMinimap}
        title="Viewfinder"
        aria-label="Viewfinder"
        aria-pressed={showMinimap}
        active={showMinimap}
      >
        <PanelBottom size={18} />
      </IconButton>
      <IconButton
        size="xxs"
        variant="ghost"
        buttonStyle="mono"
        className="zoom-reset-button"
        onClick={onResetView}
        title="Reset view (100%)"
        aria-label="Reset view"
      >
        <Locate size={18} />
      </IconButton>
    </div>
  );
};

export default ZoomControls;
