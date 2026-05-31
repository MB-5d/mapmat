import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import ColorKey from './ColorKey';

describe('ColorKey', () => {
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

  test('labels page-depth colors as levels', () => {
    act(() => {
      root.render(
        <ColorKey
          embedded
          showColorKey
          colors={['#111111']}
          connectionColors={{}}
          maxDepth={3}
          canEdit={false}
          connectionLegend={{ hasAny: false }}
        />
      );
    });

    expect(container.textContent).toContain('Levels');
    expect(container.textContent).not.toContain('Pages');
    expect(container.textContent).toContain('Level 0');
    expect(container.textContent).toContain('Level 1');
    expect(container.textContent).toContain('Level 2');
    expect(container.textContent).toContain('Level 3');
  });
});
