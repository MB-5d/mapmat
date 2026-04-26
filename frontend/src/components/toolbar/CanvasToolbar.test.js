import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import CanvasToolbar from './CanvasToolbar';

describe('CanvasToolbar', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    jest.clearAllMocks();
  });

  test('composes toolbar actions from shared icon buttons', () => {
    act(() => {
      root.render(
        <CanvasToolbar
          canEdit
          canViewComments
          canViewVersionHistory
          activeTool="select"
          connectionTool={null}
          onSelectTool={jest.fn()}
          onAddPage={jest.fn()}
          onToggleUserFlow={jest.fn()}
          onToggleCrosslink={jest.fn()}
          showCommentsPanel={false}
          onToggleCommentsPanel={jest.fn()}
          hasUnreadCommentMentions
          showReportDrawer={false}
          onToggleReportDrawer={jest.fn()}
          showLayersMenu={false}
          onToggleLayersMenu={jest.fn()}
          layersMenuRef={{ current: null }}
          layersPanel={null}
          showLegendMenu={false}
          onToggleLegendMenu={jest.fn()}
          legendMenuRef={{ current: null }}
          legendPanel={null}
          onToggleImageMenu={jest.fn()}
          showImageMenu={false}
          imageMenuRef={{ current: null }}
          hasSelection={false}
          canUndo={false}
          canRedo={false}
          undoRedoDisabledReason="Live editing is syncing"
          onUndo={jest.fn()}
          onRedo={jest.fn()}
          onClearCanvas={jest.fn()}
          onSaveMap={jest.fn()}
          onDuplicateMap={jest.fn()}
          onShowVersionHistory={jest.fn()}
          onExport={jest.fn()}
          onShare={jest.fn()}
          canOpenShare
          hasMap
          hasSavedMap={false}
          showVersionHistory={false}
          shareDisabledReason="Save before sharing"
          onBlockedShareAttempt={jest.fn()}
        />
      );
    });

    const selectButton = container.querySelector('button[aria-label="Select"]');
    const commentsButton = container.querySelector('button[aria-label="Comments"]');
    const undoButton = container.querySelector('button[aria-label="Undo"]');

    expect(selectButton.className).toContain('ui-icon-btn');
    expect(selectButton.className).toContain('canvas-tool-btn');
    expect(selectButton.className).toContain('active');
    expect(commentsButton.querySelector('.notification-dot')).not.toBeNull();
    expect(undoButton.className).toContain('disabled');
    expect(undoButton.disabled).toBe(false);
  });
});
