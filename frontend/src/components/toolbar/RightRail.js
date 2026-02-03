import React from 'react';

import CanvasToolbar from './CanvasToolbar';
import ColorKey from './ColorKey';
import LayersPanel from './LayersPanel';
import Minimap from './Minimap';
import ZoomControls from './ZoomControls';

const RightRail = ({
  layersPanelProps,
  colorKeyProps,
  toolbarProps,
  zoomProps,
  minimapProps,
}) => (
  <>
    <LayersPanel {...layersPanelProps} />
    <ColorKey {...colorKeyProps} />
    <CanvasToolbar {...toolbarProps} />
    {minimapProps?.isOpen && <Minimap {...minimapProps} />}
    <ZoomControls {...zoomProps} />
  </>
);

export default RightRail;
