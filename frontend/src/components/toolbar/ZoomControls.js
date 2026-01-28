import React from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';

import IconButton from '../ui/IconButton';

const ZoomControls = ({
  scale,
  onZoomOut,
  onZoomIn,
  onResetView,
}) => (
  <div className="zoom-controls">
    <IconButton size="sm" onClick={onZoomOut} title="Zoom Out" aria-label="Zoom Out">
      <ZoomOut size={18} />
    </IconButton>
    <span className="zoom-level">{Math.round(scale * 100)}%</span>
    <IconButton size="sm" onClick={onZoomIn} title="Zoom In" aria-label="Zoom In">
      <ZoomIn size={18} />
    </IconButton>
    <IconButton size="sm" onClick={onResetView} title="Reset View (100%)" aria-label="Reset View">
      <Maximize2 size={18} />
    </IconButton>
  </div>
);

export default ZoomControls;
