import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ExportModal from './ExportModal';

describe('ExportModal', () => {
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
  });

  const renderModal = (props = {}) => {
    const defaultProps = {
      show: true,
      onClose: jest.fn(),
      onExportAiSiteBrief: jest.fn(),
      onExportPdf: jest.fn(),
      onExportPng: jest.fn(),
      onExportCsv: jest.fn(),
      onExportJson: jest.fn(),
      onExportXml: jest.fn(),
      onExportSiteIndex: jest.fn(),
    };

    act(() => {
      root.render(
        <ExportModal
          {...defaultProps}
          {...props}
        />
      );
    });
  };

  test('shows export options in the requested order including XML', () => {
    renderModal();

    expect(container.querySelector('.modal-header h3')?.textContent).toBe('Download map');
    expect(container.querySelector('.modal-subtitle')?.textContent).toBe('Save your map in any format you need');

    const optionTitles = Array.from(container.querySelectorAll('.export-btn .ui-option-card__title'))
      .map((node) => node.textContent.trim());

    expect(optionTitles).toEqual([
      'AI brief',
      'PDF',
      'Image',
      'CSV',
      'JSON',
      'XML',
      'Index',
    ]);

    expect(container.textContent).toContain('Visual sitemap in vector');
    expect(container.textContent).toContain('High resolution snapshot with transparency');
    expect(container.textContent).toContain('All your sitemap data in a spreadsheet');
    expect(container.textContent).toContain('Formatted document of page list with links');
  });

  test('shows same-row Index format actions and reports selected format', () => {
    const onExportSiteIndex = jest.fn();
    renderModal({ onExportSiteIndex });

    const actions = container.querySelector('.export-index-format-actions');
    const buttons = Array.from(actions.querySelectorAll('button'));

    expect(actions).not.toBeNull();
    expect(buttons.map((button) => button.textContent.trim())).toEqual([
      'Doc',
      'Plain text',
      'HTML',
      'Markdown',
    ]);
    buttons.forEach((button) => {
      expect(button.className).toContain('ui-btn--type-link');
      expect(button.className).toContain('ui-btn--sm');
    });

    act(() => {
      buttons.forEach((button) => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    });

    expect(onExportSiteIndex.mock.calls.map(([format]) => format)).toEqual(['doc', 'txt', 'html', 'md']);
  });

  test('disables Image export with a size-limit notice', () => {
    const onExportPng = jest.fn();
    renderModal({
      onExportPng,
      imageExportDisabled: true,
      imageExportDisabledReason: 'Image export is unavailable for maps this large. Use PDF for full-size export.',
    });

    const imageButton = Array.from(container.querySelectorAll('button.export-btn'))
      .find((button) => button.textContent.includes('Image'));

    expect(imageButton.disabled).toBe(true);
    expect(container.textContent).toContain('Image export is unavailable for maps this large. Use PDF for full-size export.');

    act(() => {
      imageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onExportPng).not.toHaveBeenCalled();
  });
});
