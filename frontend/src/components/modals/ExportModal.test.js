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
      onClose: vi.fn(),
      onExportAiSiteBrief: vi.fn(),
      onExportPdf: vi.fn(),
      onExportSvg: vi.fn(),
      onExportPng: vi.fn(),
      onExportCsv: vi.fn(),
      onExportJson: vi.fn(),
      onExportXml: vi.fn(),
      onExportSiteIndex: vi.fn(),
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
      'SVG',
      'CSV',
      'JSON',
      'XML',
      'Index',
    ]);

    expect(container.textContent).toContain('Visual sitemap in vector');
    expect(container.textContent).toContain('Editable sitemap for Figma and design tools');
    expect(container.textContent).not.toContain('Image');
    expect(container.textContent).not.toContain('PNG download is temporarily unavailable.');
    expect(container.textContent).toContain('All your sitemap data in a spreadsheet');
    expect(container.textContent).toContain('Formatted document of page list with links');
  });

  test('runs SVG export from the download modal', () => {
    const onExportSvg = vi.fn();
    renderModal({ onExportSvg });

    const svgButton = Array.from(container.querySelectorAll('button.export-btn'))
      .find((button) => button.textContent.includes('SVG'));

    act(() => {
      svgButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onExportSvg).toHaveBeenCalledTimes(1);
  });

  test('shows same-row Index format actions and reports selected format', () => {
    const onExportSiteIndex = vi.fn();
    renderModal({ onExportSiteIndex });

    const actions = container.querySelector('.export-index-format-actions');
    const buttons = Array.from(actions.querySelectorAll('button'));

    expect(actions).not.toBeNull();
    expect(buttons.map((button) => button.textContent.trim())).toEqual([
      'Doc',
      'TXT sitemap',
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

  test('hides Image export while PNG is paused', () => {
    const onExportPng = vi.fn();
    renderModal({ onExportPng });

    const imageButton = Array.from(container.querySelectorAll('button.export-btn'))
      .find((button) => button.textContent.includes('Image'));

    expect(imageButton).toBeUndefined();
    expect(container.textContent).not.toContain('Image');
    expect(container.textContent).not.toContain('PNG download is temporarily unavailable.');
    expect(onExportPng).not.toHaveBeenCalled();
  });

  test('limits Free users to XML and Index downloads', () => {
    renderModal({ limitedFormatsOnly: true });

    expect(container.querySelector('.modal-subtitle')?.textContent).toBe('Save XML or Index files');

    const optionTitles = Array.from(container.querySelectorAll('.export-btn .ui-option-card__title'))
      .map((node) => node.textContent.trim());

    expect(optionTitles).toEqual(['XML', 'Index']);
    expect(container.textContent).not.toContain('PDF');
    expect(container.textContent).not.toContain('CSV');
    expect(container.textContent).not.toContain('JSON');
    expect(container.textContent).not.toContain('AI brief');
  });
});
