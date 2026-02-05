import React from 'react';

import CanvasToolbar from './CanvasToolbar';
import ColorKey from './ColorKey';
import LayersPanel from './LayersPanel';
import ZoomControls from './ZoomControls';
import { MinimapNavigator } from '../minimap';

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
    {minimapProps?.isOpen && <MinimapNavigator {...minimapProps} />}
    <ZoomControls {...zoomProps} />
  </>
);

export default RightRail;
