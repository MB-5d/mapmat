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

  test('shows export options in the requested order including XML', () => {
    act(() => {
      root.render(
        <ExportModal
          show
          onClose={jest.fn()}
          onExportAiSiteBrief={jest.fn()}
          onExportPdf={jest.fn()}
          onExportPng={jest.fn()}
          onExportCsv={jest.fn()}
          onExportJson={jest.fn()}
          onExportXml={jest.fn()}
          onExportSiteIndex={jest.fn()}
        />
      );
    });

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
  });
});
