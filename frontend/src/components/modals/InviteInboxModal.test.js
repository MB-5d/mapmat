import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import InviteInboxModal from './InviteInboxModal';

describe('InviteInboxModal', () => {
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

  test('refreshes and accepts invites', () => {
    const onRefresh = jest.fn();
    const onAccept = jest.fn();
    const invite = { id: 'inv-1', mapName: 'Alpha Map', role: 'viewer' };

    act(() => {
      root.render(
        <InviteInboxModal
          show
          invites={[invite]}
          onClose={jest.fn()}
          onRefresh={onRefresh}
          onAccept={onAccept}
          onDecline={jest.fn()}
        />
      );
    });

    const refreshButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Refresh')
    );
    const acceptButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Accept')
    );

    act(() => {
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      acceptButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith(invite);
  });
});
