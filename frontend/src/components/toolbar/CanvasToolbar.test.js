import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import CanvasToolbar from './CanvasToolbar';

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');

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

  test('matches the requested toolbar order for a saved map', () => {
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
          showOrientationMenu={false}
          onToggleOrientationMenu={jest.fn()}
          orientationMenuRef={{ current: null }}
          onMapOrientationChange={jest.fn()}
          onToggleImageMenu={jest.fn()}
          showImageMenu={false}
          imageMenuRef={{ current: null }}
          hasSelection={false}
          canUndo
          canRedo
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
          hasSavedMap
          showVersionHistory={false}
        />
      );
    });

    const toolbarLabels = Array.from(container.querySelectorAll('.canvas-toolbar button[aria-label]'))
      .map((button) => button.getAttribute('aria-label'));

    expect(toolbarLabels).toEqual([
      'Select',
      'User Flow',
      'Crosslink',
      'Add Page',
      'Duplicate Map',
      'Undo',
      'Redo',
      'Comments',
      'Report',
      'Version History',
      'Images',
      'Layers',
      'Legend',
      'Orientation',
      'Clear Canvas',
      'Download',
      'Share',
    ]);

    const duplicateButton = container.querySelector('button[aria-label="Duplicate Map"]');
    expect(duplicateButton).not.toBeNull();
    expect(duplicateButton.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.lucide-copy-plus')).toBeNull();
  });

  test('keeps save map in the final toolbar group for unsaved maps', () => {
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
          showOrientationMenu={false}
          onToggleOrientationMenu={jest.fn()}
          orientationMenuRef={{ current: null }}
          onMapOrientationChange={jest.fn()}
          onToggleImageMenu={jest.fn()}
          showImageMenu={false}
          imageMenuRef={{ current: null }}
          hasSelection={false}
          canUndo
          canRedo
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
        />
      );
    });

    const toolbarLabels = Array.from(container.querySelectorAll('.canvas-toolbar button[aria-label]'))
      .map((button) => button.getAttribute('aria-label'));

    expect(toolbarLabels).toEqual([
      'Select',
      'User Flow',
      'Crosslink',
      'Add Page',
      'Undo',
      'Redo',
      'Comments',
      'Report',
      'Version History',
      'Images',
      'Layers',
      'Legend',
      'Orientation',
      'Save Map',
      'Clear Canvas',
      'Download',
      'Share',
    ]);
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

  test('shows orientation as a top-level toolbar menu next to legend', () => {
    const onToggleOrientationMenu = jest.fn();
    const onMapOrientationChange = jest.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          canEdit={false}
          canViewComments={false}
          canViewVersionHistory={false}
          activeTool="select"
          connectionTool={null}
          showCommentsPanel={false}
          showReportDrawer={false}
          showLayersMenu={false}
          layersMenuRef={{ current: null }}
          showLegendMenu={false}
          legendMenuRef={{ current: null }}
          onToggleImageMenu={jest.fn()}
          showImageMenu={false}
          imageMenuRef={{ current: null }}
          hasSelection={false}
          canUndo={false}
          canRedo={false}
          hasMap
          hasSavedMap
          showVersionHistory={false}
          mapOrientation="horizontal"
          showOrientationMenu
          onToggleOrientationMenu={onToggleOrientationMenu}
          orientationMenuRef={{ current: null }}
          onMapOrientationChange={onMapOrientationChange}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const legendButton = container.querySelector('button[aria-label="Legend"]');
    const orientationButton = container.querySelector('button[aria-label="Orientation"]');
    const verticalRadio = container.querySelector('input[type="radio"][value="vertical"]');
    const horizontalRadio = container.querySelector('input[type="radio"][value="horizontal"]');
    const radioGroup = container.querySelector('[role="radiogroup"]');

    expect(orientationButton).not.toBeNull();
    expect(orientationButton.className).toContain('active');
    expect(orientationButton.getAttribute('aria-expanded')).toBe('true');
    expect(buttons.indexOf(orientationButton)).toBe(buttons.indexOf(legendButton) + 1);
    expect(container.querySelector('.ui-menu-title')?.textContent).toBe('Map Orientation');
    expect(radioGroup?.getAttribute('aria-label')).toBe('Map Orientation');
    expect(verticalRadio).not.toBeNull();
    expect(horizontalRadio).not.toBeNull();
    expect(verticalRadio.checked).toBe(false);
    expect(horizontalRadio.checked).toBe(true);

    act(() => {
      orientationButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      verticalRadio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleOrientationMenu).toHaveBeenCalledTimes(1);
    expect(onMapOrientationChange).toHaveBeenCalledWith('vertical');
  });

  test('uses combined image download actions', () => {
    const onDownloadImagesAll = jest.fn();
    const onDownloadImagesSelected = jest.fn();
    const onAddScreenshotCredits = jest.fn();

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
          screenshotCreditsLabel="24"
          onAddScreenshotCredits={onAddScreenshotCredits}
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
    const imageReport = buttons.find((button) => button.textContent.includes('Image report'));
    const addCredits = buttons.find((button) => button.textContent.includes('Add credits'));
    const imageMenu = container.querySelector('.canvas-tool-menu-images');
    const scrollArea = imageMenu.querySelector('.canvas-tool-menu-images-scroll');
    expect(container.querySelector('.ui-menu-title')?.textContent).toBe('Images');
    expect(scrollArea).not.toBeNull();
    expect(downloadAll).not.toBeNull();
    expect(downloadSelected).not.toBeNull();
    expect(imageReport).not.toBeNull();
    expect(addCredits).not.toBeNull();
    expect(scrollArea.contains(addCredits)).toBe(false);
    expect(imageMenu.lastElementChild.className).toContain('canvas-tool-menu-credits');
    expect(container.querySelector('.canvas-tool-menu-credits')?.textContent).toContain('24 remaining');
    expect(addCredits.className).toContain('ui-btn--type-link');
    expect(addCredits.querySelector('.ui-icon__svg')).not.toBeNull();
    expect(buttons.indexOf(downloadAll)).toBeGreaterThan(buttons.indexOf(imageReport));
    expect(container.querySelector('.canvas-tool-menu-download-divider')).not.toBeNull();
    expect(container.querySelector('.canvas-tool-menu-credits-divider')).not.toBeNull();
    expect(buttons.some((button) => button.textContent.includes('Download thumbnails'))).toBe(false);
    expect(buttons.some((button) => button.textContent.includes('Download full screenshots'))).toBe(false);

    act(() => {
      downloadAll.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      downloadSelected.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      addCredits.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDownloadImagesAll).toHaveBeenCalledTimes(1);
    expect(onDownloadImagesSelected).toHaveBeenCalledTimes(1);
    expect(onAddScreenshotCredits).toHaveBeenCalledTimes(1);
  });

  test('keeps the images menu 40px narrower with a pinned credits footer', () => {
    expect(appCss).toMatch(/\.canvas-tool-menu-images\s*{[^}]*width:\s*232px;[^}]*min-width:\s*232px;[^}]*max-width:\s*232px;[^}]*overflow:\s*hidden;/s);
    expect(appCss).toMatch(/\.canvas-tool-menu-images-scroll\s*{[^}]*overflow-y:\s*auto;/s);
    expect(appCss).toMatch(/\.canvas-tool-menu-credits\s*{[^}]*flex:\s*0 0 auto;/s);
  });

  test('requires a saved map before image capture actions are available', () => {
    const onGetThumbnailsAll = jest.fn();
    const onGetThumbnailsSelected = jest.fn();
    const onUpdateCapturedThumbnails = jest.fn();
    const onGetFullScreenshotsAll = jest.fn();
    const onGetFullScreenshotsSelected = jest.fn();
    const onUpdateCapturedFullScreenshots = jest.fn();
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
          onGetThumbnailsAll={onGetThumbnailsAll}
          onGetThumbnailsSelected={onGetThumbnailsSelected}
          onUpdateCapturedThumbnails={onUpdateCapturedThumbnails}
          onGetFullScreenshotsAll={onGetFullScreenshotsAll}
          onGetFullScreenshotsSelected={onGetFullScreenshotsSelected}
          onUpdateCapturedFullScreenshots={onUpdateCapturedFullScreenshots}
          onDownloadImagesAll={onDownloadImagesAll}
          onDownloadImagesSelected={onDownloadImagesSelected}
          showImageMenu
          imageMenuRef={{ current: null }}
          hasSelection
          hasDownloadableThumbnails
          hasFullScreenshotAssets
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
          hasSavedMap={false}
          showVersionHistory={false}
        />
      );
    });

    expect(container.textContent).toContain('Save this map before capturing screenshots.');

    const buttons = Array.from(container.querySelectorAll('button'));
    const captureButtons = [
      'Get Thumbnails (All)',
      'Get Thumbnails (Selected)',
      'Update Captured Thumbnails',
      'Get Full page (All)',
      'Get Full page (Selected)',
      'Update Captured Full page',
    ].map((label) => buttons.find((button) => button.textContent.includes(label)));

    captureButtons.forEach((button) => {
      expect(button).not.toBeNull();
      expect(button.disabled).toBe(true);
      expect(button.title).toBe('Save this map before capturing screenshots.');
    });

    const downloadAll = buttons.find((button) => button.textContent.includes('Download All'));
    const downloadSelected = buttons.find((button) => button.textContent.includes('Download Selected'));
    expect(downloadAll.disabled).toBe(true);
    expect(downloadSelected.disabled).toBe(true);

    act(() => {
      [...captureButtons, downloadAll, downloadSelected].forEach((button) => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    });

    expect(onGetThumbnailsAll).not.toHaveBeenCalled();
    expect(onGetThumbnailsSelected).not.toHaveBeenCalled();
    expect(onUpdateCapturedThumbnails).not.toHaveBeenCalled();
    expect(onGetFullScreenshotsAll).not.toHaveBeenCalled();
    expect(onGetFullScreenshotsSelected).not.toHaveBeenCalled();
    expect(onUpdateCapturedFullScreenshots).not.toHaveBeenCalled();
    expect(onDownloadImagesAll).not.toHaveBeenCalled();
    expect(onDownloadImagesSelected).not.toHaveBeenCalled();
  });

  test('keeps selected image actions visibly disabled when nothing is selected', () => {
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
          onGetThumbnailsSelected={jest.fn()}
          onGetFullScreenshotsSelected={jest.fn()}
          onDownloadImagesSelected={jest.fn()}
          showImageMenu
          imageMenuRef={{ current: null }}
          hasSelection={false}
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
    const selectedActions = [
      buttons.find((button) => button.textContent.includes('Get Thumbnails (Selected)')),
      buttons.find((button) => button.textContent.includes('Get Full page (Selected)')),
      buttons.find((button) => button.textContent.includes('Download Selected')),
    ];

    selectedActions.forEach((button) => {
      expect(button).not.toBeNull();
      expect(button.disabled).toBe(true);
      expect(button.title).toBe('Select pages first');
    });
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
      .find((button) => button.textContent.includes('Update Captured Full page'));
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
      .find((button) => button.textContent.includes('Update Captured Full page'));
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
          fullScreenshotsAllLabel="Get Full page (Remaining)"
        />
      );
    });

    const remainingButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Get Full page (Remaining)'));
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

  test('uses recapture labels for selected saved image actions', () => {
    const onGetThumbnailsSelected = jest.fn();
    const onGetFullScreenshotsSelected = jest.fn();

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
          onGetThumbnailsSelected={onGetThumbnailsSelected}
          onGetFullScreenshotsSelected={onGetFullScreenshotsSelected}
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
          thumbnailsSelectedLabel="Recapture"
          fullScreenshotsSelectedLabel="Recapture"
        />
      );
    });

    const recaptureButtons = Array.from(container.querySelectorAll('button'))
      .filter((button) => button.textContent.includes('Recapture'));
    expect(recaptureButtons).toHaveLength(2);
    expect(container.textContent).not.toContain('Get Thumbnails (Selected)');
    expect(container.textContent).not.toContain('Get Full page (Selected)');

    act(() => {
      recaptureButtons.forEach((button) => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    });

    expect(onGetThumbnailsSelected).toHaveBeenCalledTimes(1);
    expect(onGetFullScreenshotsSelected).toHaveBeenCalledTimes(1);
  });

  test('shows the image report option instead of inline capture issues', () => {
    const onOpenImageReport = jest.fn();

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
          onOpenImageReport={onOpenImageReport}
          hasSelection={false}
          hasAnyThumbnails
          onToggleThumbnails={jest.fn()}
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

    expect(container.textContent).toContain('Image report');
    expect(container.textContent).toContain('Image report1');
    expect(container.textContent).toContain('View screenshots');
    expect(container.textContent).toContain('Thumbnails (visible area)');
    expect(container.textContent).toContain('Full page');
    expect(container.textContent).not.toContain('Saves a full-page asset per page');
    expect(container.textContent).toContain('Thumbnails');
    expect(container.textContent).not.toContain('Screenshots');
    expect(container.textContent).not.toContain('Capture issues');
    expect(container.textContent).not.toContain('PDF/file');
    expect(container.textContent).not.toContain('Batch');

    const imageReportButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Image report'));

    act(() => {
      imageReportButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenImageReport).toHaveBeenCalledTimes(1);
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
