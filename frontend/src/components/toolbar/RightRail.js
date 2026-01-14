import React from 'react';

import CanvasToolbar from './CanvasToolbar';
import ColorKey from './ColorKey';
import LayersPanel from './LayersPanel';
import ZoomControls from './ZoomControls';

const RightRail = ({
  layersPanelProps,
  colorKeyProps,
  toolbarProps,
  zoomProps,
}) => (
  <>
    <LayersPanel {...layersPanelProps} />
    <ColorKey {...colorKeyProps} />
    <CanvasToolbar {...toolbarProps} />
    <ZoomControls {...zoomProps} />
  </>
);

export default RightRail;
