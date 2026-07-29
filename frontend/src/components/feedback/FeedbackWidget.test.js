import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import FeedbackWidget from './FeedbackWidget';
import { ROUTE_SURFACES } from '../../utils/appRoutes';

describe('FeedbackWidget', () => {
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

  test('shows the feedback tab on share routes', () => {
    act(() => {
      root.render(
        <FeedbackWidget
          currentRoute={{
            surface: ROUTE_SURFACES.SHARE,
            pathname: '/share/abc123',
            shareId: 'abc123',
          }}
          currentUser={null}
          currentMapId={null}
          activeSurfaces={{}}
          showToast={vi.fn()}
        />
      );
    });

    expect(container.querySelector('.feedback-widget-tab')).not.toBeNull();
    expect(container.textContent).toContain('Feedback');
  });
});
