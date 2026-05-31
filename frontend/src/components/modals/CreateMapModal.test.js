import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import CreateMapModal from './CreateMapModal';

describe('CreateMapModal', () => {
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

  test('uses shared option cards and preserves create-map actions', () => {
    const onClose = jest.fn();
    const onStartFromScratch = jest.fn();
    const onImportFromFile = jest.fn();

    act(() => {
      root.render(
        <CreateMapModal
          show
          onClose={onClose}
          onStartFromScratch={onStartFromScratch}
          onImportFromFile={onImportFromFile}
        />
      );
    });

    const optionCards = container.querySelectorAll('.ui-option-card');
    const scratchCard = Array.from(optionCards).find((card) => card.textContent.includes('Start from Scratch'));
    const importCard = Array.from(optionCards).find((card) => card.textContent.includes('Import from File'));

    expect(optionCards).toHaveLength(3);

    act(() => {
      scratchCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      importCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onStartFromScratch).toHaveBeenCalledTimes(1);
    expect(onImportFromFile).toHaveBeenCalledTimes(1);
  });
});
