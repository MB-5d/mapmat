import React from 'react';

import CanvasToolbar from './CanvasToolbar';
import ZoomControls from './ZoomControls';
import { MinimapNavigator } from '../minimap';

const RightRail = ({
  toolbarProps,
  zoomProps,
  minimapProps,
}) => (
  <>
    <CanvasToolbar {...toolbarProps} />
    {minimapProps?.isOpen && <MinimapNavigator {...minimapProps} />}
    <ZoomControls {...zoomProps} />
  </>
);

export default RightRail;
