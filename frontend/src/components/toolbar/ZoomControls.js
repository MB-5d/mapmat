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
        size="sm"
        onClick={onZoomOut}
        title="Zoom Out"
        aria-label="Zoom Out"
        disabled={safeScale <= minScale + 0.001}
      >
        <ZoomOut size={18} />
      </IconButton>
      <span className="zoom-level">{Math.round(safeScale * 100)}%</span>
      <IconButton
        size="sm"
        onClick={onZoomIn}
        title="Zoom In"
        aria-label="Zoom In"
        disabled={safeScale >= maxScale - 0.001}
      >
        <ZoomIn size={18} />
      </IconButton>
      <div className="zoom-divider" />
      <IconButton
        size="sm"
        onClick={onToggleMinimap}
        title="Toggle Viewfinder"
        aria-label="Toggle Viewfinder"
        aria-pressed={showMinimap}
      >
        <PanelBottom size={18} />
      </IconButton>
      <IconButton
        size="sm"
        onClick={onResetView}
        title="Reset View (100%)"
        aria-label="Reset View"
      >
        <Locate size={18} />
      </IconButton>
    </div>
  );
};

export default ZoomControls;
