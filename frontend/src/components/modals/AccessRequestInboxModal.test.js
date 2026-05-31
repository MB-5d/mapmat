import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AccessRequestInboxModal from './AccessRequestInboxModal';

describe('AccessRequestInboxModal', () => {
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

  test('approves a request with the selected role', () => {
    const onApprove = jest.fn();
    const request = {
      id: 'req-1',
      mapName: 'Alpha Map',
      requesterName: 'Sam',
      requestedRole: 'viewer',
    };

    act(() => {
      root.render(
        <AccessRequestInboxModal
          show
          requests={[request]}
          onClose={jest.fn()}
          onRefresh={jest.fn()}
          onApprove={onApprove}
          onDeny={jest.fn()}
        />
      );
    });

    const select = container.querySelector('select');
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');

    act(() => {
      descriptor.set.call(select, 'editor');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const approveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Approve')
    );

    act(() => {
      approveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onApprove).toHaveBeenCalledWith(request, 'editor');
  });
});
