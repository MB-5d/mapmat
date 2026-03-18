import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { COEDITING_LIVE_STATUS, useCoeditingLive } from './useCoeditingLive';
import {
  getCoeditingLiveDocument,
  getCoeditingReplay,
  ingestCoeditingOperation,
  openCoeditingSocket,
} from '../api';

jest.mock('../api', () => ({
  getCoeditingLiveDocument: jest.fn(),
  getCoeditingReplay: jest.fn(),
  ingestCoeditingOperation: jest.fn(),
  openCoeditingSocket: jest.fn(),
}));

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useCoeditingLive', () => {
  let latestLiveState = null;
  let applyDocument;
  let onWarn;
  let socket;
  let originalWebSocket;
  let originalStructuredClone;
  let originalActEnvironmentFlag;
  let container;
  let renderedRoot;

  const baseDocument = {
    mapId: 'map-1',
    version: 0,
    name: 'Live Test',
    root: {
      id: 'root',
      title: 'Root',
      children: [],
    },
    orphans: [],
    connections: [],
  };

  function Harness() {
    latestLiveState = useCoeditingLive({
      enabled: true,
      mapId: 'map-1',
      actorId: 'user-1',
      canEdit: true,
      getLocalDocument: () => baseDocument,
      applyDocument,
      onWarn,
    });
    return null;
  }

  async function connectLiveSession() {
    await act(async () => {
      renderedRoot.render(<Harness />);
      await Promise.resolve();
    });

    expect(getCoeditingLiveDocument).toHaveBeenCalledWith('map-1');

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(openCoeditingSocket).toHaveBeenCalledWith('map-1');

    act(() => {
      socket.onopen?.();
    });

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'welcome',
          heartbeatIntervalSec: 20,
        }),
      });
    });

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'joined',
          heartbeatIntervalSec: 20,
          participants: [
            {
              sessionId: 'session-1',
              clientName: 'web',
            },
          ],
        }),
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(latestLiveState.liveStatus).toBe(COEDITING_LIVE_STATUS.CONNECTED);
  }

  beforeEach(() => {
    latestLiveState = null;
    applyDocument = jest.fn();
    onWarn = jest.fn();
    socket = {
      readyState: 1,
      send: jest.fn(),
      close: jest.fn(),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    renderedRoot = createRoot(container);
    originalWebSocket = global.WebSocket;
    originalStructuredClone = global.structuredClone;
    originalActEnvironmentFlag = global.IS_REACT_ACT_ENVIRONMENT;
    global.WebSocket = { OPEN: 1 };
    global.IS_REACT_ACT_ENVIRONMENT = true;
    global.structuredClone = global.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));

    jest.useFakeTimers();
    getCoeditingLiveDocument.mockResolvedValue({ liveDocument: baseDocument });
    getCoeditingReplay.mockResolvedValue({
      replay: {
        operations: [],
        currentVersion: 0,
      },
    });
    openCoeditingSocket.mockReturnValue(socket);
  });

  afterEach(() => {
    act(() => {
      renderedRoot.unmount();
    });
    container.remove();
    jest.clearAllTimers();
    jest.useRealTimers();
    global.WebSocket = originalWebSocket;
    global.structuredClone = originalStructuredClone;
    global.IS_REACT_ACT_ENVIRONMENT = originalActEnvironmentFlag;
    jest.resetAllMocks();
  });

  it('ignores the ingest response when the same committed op already arrived over the socket', async () => {
    const ingestDeferred = createDeferred();
    ingestCoeditingOperation.mockReturnValue(ingestDeferred.promise);

    await connectLiveSession();

    const draftPayload = {
      nodeId: 'node-1',
      parentId: 'root',
      afterNodeId: null,
      node: {
        id: 'node-1',
        title: 'New Page',
        children: [],
      },
    };

    let submitResult;
    act(() => {
      submitResult = latestLiveState.submitDraft({
        type: 'node.add',
        payload: draftPayload,
      });
    });

    expect(submitResult).toEqual(expect.objectContaining({ ok: true }));

    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(ingestCoeditingOperation).toHaveBeenCalledTimes(1);

    const committedOperation = {
      opId: submitResult.opId,
      mapId: 'map-1',
      sessionId: 'session-1',
      actorId: 'user-1',
      version: 1,
      timestamp: new Date().toISOString(),
      type: 'node.add',
      payload: draftPayload,
    };

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'operation.committed',
          operation: committedOperation,
        }),
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(latestLiveState.pendingCount).toBe(0);
    expect(latestLiveState.liveStatus).toBe(COEDITING_LIVE_STATUS.CONNECTED);

    await act(async () => {
      ingestDeferred.resolve({ operation: committedOperation });
      await ingestDeferred.promise;
      await Promise.resolve();
    });

    expect(latestLiveState.liveStatus).toBe(COEDITING_LIVE_STATUS.CONNECTED);
    expect(latestLiveState.liveStatusDetail).toBe('Connected');
    expect(onWarn).not.toHaveBeenCalled();

    const latestDocument = applyDocument.mock.calls[applyDocument.mock.calls.length - 1][0];
    expect(latestDocument.root.children).toHaveLength(1);
    expect(latestDocument.root.children[0].id).toBe('node-1');
  });
});
