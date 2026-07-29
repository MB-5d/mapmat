import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ImportModal from './ImportModal';
import { IMPORT_MODES } from '../../utils/importParsers';

describe('ImportModal', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  test('offers upload and paste URL entry points', () => {
    act(() => {
      root.render(<ImportModal show onClose={vi.fn()} />);
    });

    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toContain('Upload file');
    expect(tabs[1].textContent).toContain('Paste URLs');

    act(() => tabs[1].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelector('#import-paste-urls')).not.toBeNull();
    expect(container.textContent).toContain('Review URLs');
  });

  test('shows diagnostics and imports with the selected mode', () => {
    const onImport = vi.fn();
    const preview = {
      sourceName: 'urls.csv',
      parseType: 'CSV',
      hasExplicitStructure: false,
      exactBackup: false,
      diagnostics: {
        validCount: 100,
        duplicateCount: 2,
        invalidCount: 1,
        ignoredCount: 1,
      },
    };

    act(() => {
      root.render(
        <ImportModal
          show
          onClose={vi.fn()}
          onImport={onImport}
          preview={preview}
        />
      );
    });

    expect(container.textContent).toContain('100Valid unique pages');
    expect(container.textContent).toContain('2Duplicates ignored');
    const hierarchyOption = container.querySelector(`input[value="${IMPORT_MODES.URL_HIERARCHY}"]`);
    act(() => hierarchyOption.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const importButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Import 100 URLs'));
    act(() => importButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onImport).toHaveBeenCalledWith(IMPORT_MODES.URL_HIERARCHY);
    expect(container.textContent).toContain('Screenshots will not start automatically');
  });

  test('locks exact Vellic backups to exact restore', () => {
    act(() => {
      root.render(
        <ImportModal
          show
          onClose={vi.fn()}
          preview={{
            sourceName: 'backup.json',
            parseType: 'Vellic JSON',
            hasExplicitStructure: true,
            exactBackup: true,
            diagnostics: { validCount: 4, duplicateCount: 0, invalidCount: 0, ignoredCount: 0 },
          }}
        />
      );
    });

    expect(container.textContent).toContain('exact Vellic map backup');
    expect(container.textContent).toContain('Restore exact map');
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
  });
});
