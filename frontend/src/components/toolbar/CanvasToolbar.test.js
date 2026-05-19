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

  test('shows saving state on the canvas save button', () => {
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
          onUndo={jest.fn()}
          onRedo={jest.fn()}
          onClearCanvas={jest.fn()}
          onSaveMap={jest.fn()}
          isSavingMap
          onDuplicateMap={jest.fn()}
          onShowVersionHistory={jest.fn()}
          onExport={jest.fn()}
          onShare={jest.fn()}
          hasMap
          hasSavedMap={false}
          showVersionHistory={false}
        />
      );
    });

    const saveButton = container.querySelector('button[aria-label="Saving"]');
    expect(saveButton).not.toBeNull();
    expect(saveButton.textContent).toContain('Saving');
    expect(saveButton.className).toContain('is-saving');
    expect(saveButton.disabled).toBe(true);
  });

  test('uses combined image download actions', () => {
    const onDownloadImagesAll = jest.fn();
    const onDownloadImagesSelected = jest.fn();

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
          onGetThumbnailsAll={jest.fn()}
          onGetThumbnailsSelected={jest.fn()}
          onGetFullScreenshotsAll={jest.fn()}
          onGetFullScreenshotsSelected={jest.fn()}
          onDownloadImagesAll={onDownloadImagesAll}
          onDownloadImagesSelected={onDownloadImagesSelected}
          showImageMenu
          imageMenuRef={{ current: null }}
          hasSelection
          hasDownloadableImages
          hasDownloadableSelectedImages
          canUndo={false}
          canRedo={false}
          onUndo={jest.fn()}
          onRedo={jest.fn()}
          onClearCanvas={jest.fn()}
          onSaveMap={jest.fn()}
          onDuplicateMap={jest.fn()}
          onShowVersionHistory={jest.fn()}
          onExport={jest.fn()}
          onShare={jest.fn()}
          hasMap
          hasSavedMap
          showVersionHistory={false}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const downloadAll = buttons.find((button) => button.textContent.includes('Download All'));
    const downloadSelected = buttons.find((button) => button.textContent.includes('Download Selected'));
    expect(downloadAll).not.toBeNull();
    expect(downloadSelected).not.toBeNull();
    expect(buttons.some((button) => button.textContent.includes('Download thumbnails'))).toBe(false);
    expect(buttons.some((button) => button.textContent.includes('Download full screenshots'))).toBe(false);

    act(() => {
      downloadAll.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      downloadSelected.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDownloadImagesAll).toHaveBeenCalledTimes(1);
    expect(onDownloadImagesSelected).toHaveBeenCalledTimes(1);
  });

  test('uses captured image update actions only when saved images exist', () => {
    const onUpdateCapturedThumbnails = jest.fn();
    const onUpdateCapturedFullScreenshots = jest.fn();

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
          onGetThumbnailsAll={jest.fn()}
          onGetThumbnailsSelected={jest.fn()}
          onUpdateCapturedThumbnails={onUpdateCapturedThumbnails}
          onGetFullScreenshotsAll={jest.fn()}
          onGetFullScreenshotsSelected={jest.fn()}
          onUpdateCapturedFullScreenshots={onUpdateCapturedFullScreenshots}
          showImageMenu
          imageMenuRef={{ current: null }}
          hasSelection={false}
          hasDownloadableThumbnails={false}
          hasFullScreenshotAssets={false}
          canUndo={false}
          canRedo={false}
          onUndo={jest.fn()}
          onRedo={jest.fn()}
          onClearCanvas={jest.fn()}
          onSaveMap={jest.fn()}
          onDuplicateMap={jest.fn()}
          onShowVersionHistory={jest.fn()}
          onExport={jest.fn()}
          onShare={jest.fn()}
          hasMap
          hasSavedMap
          showVersionHistory={false}
        />
      );
    });

    let updateThumbnailButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Update Captured Thumbnails'));
    let updateScreenshotButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Update Captured Screenshots'));
    expect(updateThumbnailButton.disabled).toBe(true);
    expect(updateScreenshotButton.disabled).toBe(true);

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
          onGetThumbnailsAll={jest.fn()}
          onGetThumbnailsSelected={jest.fn()}
          onUpdateCapturedThumbnails={onUpdateCapturedThumbnails}
          onGetFullScreenshotsAll={jest.fn()}
          onGetFullScreenshotsSelected={jest.fn()}
          onUpdateCapturedFullScreenshots={onUpdateCapturedFullScreenshots}
          showImageMenu
          imageMenuRef={{ current: null }}
          hasSelection={false}
          hasDownloadableThumbnails
          hasFullScreenshotAssets
          canUndo={false}
          canRedo={false}
          onUndo={jest.fn()}
          onRedo={jest.fn()}
          onClearCanvas={jest.fn()}
          onSaveMap={jest.fn()}
          onDuplicateMap={jest.fn()}
          onShowVersionHistory={jest.fn()}
          onExport={jest.fn()}
          onShare={jest.fn()}
          hasMap
          hasSavedMap
          showVersionHistory={false}
        />
      );
    });

    updateThumbnailButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Update Captured Thumbnails'));
    updateScreenshotButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Update Captured Screenshots'));
    expect(updateThumbnailButton.disabled).toBe(false);
    expect(updateScreenshotButton.disabled).toBe(false);

    act(() => {
      updateThumbnailButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      updateScreenshotButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateCapturedThumbnails).toHaveBeenCalledTimes(1);
    expect(onUpdateCapturedFullScreenshots).toHaveBeenCalledTimes(1);
  });

  test('shows remaining screenshot action when some full screenshots exist', () => {
    const onGetFullScreenshotsAll = jest.fn();

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
          onGetFullScreenshotsAll={onGetFullScreenshotsAll}
          onGetFullScreenshotsSelected={jest.fn()}
          showImageMenu
          imageMenuRef={{ current: null }}
          hasSelection
          canUndo={false}
          canRedo={false}
          onUndo={jest.fn()}
          onRedo={jest.fn()}
          onClearCanvas={jest.fn()}
          onSaveMap={jest.fn()}
          onDuplicateMap={jest.fn()}
          onShowVersionHistory={jest.fn()}
          onExport={jest.fn()}
          onShare={jest.fn()}
          hasMap
          hasSavedMap
          showVersionHistory={false}
          fullScreenshotsAllLabel="Get Screenshots (Remaining)"
        />
      );
    });

    const remainingButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Get Screenshots (Remaining)'));
    expect(remainingButton).not.toBeNull();
    expect(remainingButton.disabled).toBe(false);

    act(() => {
      remainingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onGetFullScreenshotsAll).toHaveBeenCalledTimes(1);
  });

  test('shows remaining thumbnail action when some thumbnails exist', () => {
    const onGetThumbnailsAll = jest.fn();

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
          onGetThumbnailsAll={onGetThumbnailsAll}
          onGetThumbnailsSelected={jest.fn()}
          showImageMenu
          imageMenuRef={{ current: null }}
          hasSelection
          canUndo={false}
          canRedo={false}
          onUndo={jest.fn()}
          onRedo={jest.fn()}
          onClearCanvas={jest.fn()}
          onSaveMap={jest.fn()}
          onDuplicateMap={jest.fn()}
          onShowVersionHistory={jest.fn()}
          onExport={jest.fn()}
          onShare={jest.fn()}
          hasMap
          hasSavedMap
          showVersionHistory={false}
          thumbnailsAllLabel="Get Thumbnails (Remaining)"
        />
      );
    });

    const remainingButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Get Thumbnails (Remaining)'));
    expect(remainingButton).not.toBeNull();
    expect(remainingButton.disabled).toBe(false);

    act(() => {
      remainingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onGetThumbnailsAll).toHaveBeenCalledTimes(1);
  });

  test('shows capture issues in the image menu', () => {
    const onSelectCaptureIssue = jest.fn();
    const onOpenCaptureIssueUrl = jest.fn();

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
          showReportDrawer={false}
          onToggleReportDrawer={jest.fn()}
          showLayersMenu={false}
          onToggleLayersMenu={jest.fn()}
          layersMenuRef={{ current: null }}
          layersPanel={null}
          showLegendMenu={false}
          onToggleLegendMenu={jest.fn()}
          legendMenuRef={{ current: null }}
          onToggleImageMenu={jest.fn()}
          showImageMenu
          imageMenuRef={{ current: null }}
          captureIssues={[{
            id: 'n1:file',
            nodeId: 'n1',
            pageNumber: '40',
            title: 'Handbook',
            url: 'https://example.com/file.pdf',
            type: 'file',
            label: 'PDF/file',
          }]}
          onSelectCaptureIssue={onSelectCaptureIssue}
          onOpenCaptureIssueUrl={onOpenCaptureIssueUrl}
          hasSelection={false}
          canUndo={false}
          canRedo={false}
          onUndo={jest.fn()}
          onRedo={jest.fn()}
          onClearCanvas={jest.fn()}
          onSaveMap={jest.fn()}
          onDuplicateMap={jest.fn()}
          onShowVersionHistory={jest.fn()}
          onExport={jest.fn()}
          onShare={jest.fn()}
          hasMap
          hasSavedMap
          showVersionHistory={false}
        />
      );
    });

    expect(container.textContent).toContain('Capture issues');
    expect(container.textContent).toContain('PDF/file');
    expect(container.textContent).not.toContain('Batch');

    const selectButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Select');
    const openButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Open');

    act(() => {
      selectButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      openButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectCaptureIssue).toHaveBeenCalledTimes(1);
    expect(onOpenCaptureIssueUrl).toHaveBeenCalledTimes(1);
  });

  test('marks the image menu as scrollable and contains wheel events', () => {
    const onCanvasWheel = jest.fn();
    container.addEventListener('wheel', onCanvasWheel);

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
          showReportDrawer={false}
          onToggleReportDrawer={jest.fn()}
          showLayersMenu={false}
          onToggleLayersMenu={jest.fn()}
          layersMenuRef={{ current: null }}
          layersPanel={null}
          showLegendMenu={false}
          onToggleLegendMenu={jest.fn()}
          legendMenuRef={{ current: null }}
          onToggleImageMenu={jest.fn()}
          showImageMenu
          imageMenuRef={{ current: null }}
          hasSelection={false}
          canUndo={false}
          canRedo={false}
          onUndo={jest.fn()}
          onRedo={jest.fn()}
          onClearCanvas={jest.fn()}
          onSaveMap={jest.fn()}
          onDuplicateMap={jest.fn()}
          onShowVersionHistory={jest.fn()}
          onExport={jest.fn()}
          onShare={jest.fn()}
          hasMap
          hasSavedMap
          showVersionHistory={false}
        />
      );
    });

    const imageMenu = container.querySelector('.canvas-tool-menu-images');
    expect(imageMenu).not.toBeNull();

    act(() => {
      imageMenu.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 }));
    });

    expect(onCanvasWheel).not.toHaveBeenCalled();
  });
});
