import React from 'react';
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';

const ZoomControls = ({
  scale,
  onZoomOut,
  onZoomIn,
  onFitToScreen,
  onResetView,
}) => (
  <div className="zoom-controls">
    <button className="zoom-btn" onClick={onZoomOut} title="Zoom Out">
      <ZoomOut size={18} />
    </button>
    <span className="zoom-level">{Math.round(scale * 100)}%</span>
    <button className="zoom-btn" onClick={onZoomIn} title="Zoom In">
      <ZoomIn size={18} />
    </button>
    <div className="zoom-divider" />
    <button className="zoom-btn" onClick={onFitToScreen} title="Fit to Screen">
      <Minimize2 size={18} />
    </button>
    <button className="zoom-btn" onClick={onResetView} title="Reset View (100%)">
      <Maximize2 size={18} />
    </button>
  </div>
);

export default ZoomControls;
