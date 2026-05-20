import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getCoeditingLiveDocument,
  getCoeditingReplay,
  ingestCoeditingOperation,
  openCoeditingSocket,
} from '../api';
import {
  applyOperationToDocument,
  CoeditingDocumentError,
  normalizeLiveDocument,
  replayOperations,
} from '../utils/coeditingDocument';

const STATUS = Object.freeze({
  DISABLED: 'disabled',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  OUT_OF_SYNC: 'out_of_sync',
});

const CLIENT_NAME = 'web';
const DEFAULT_HEARTBEAT_SEC = 20;
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];
const JOIN_TIMEOUT_MS = 8000;
const MAX_SELECTION_IDS = 12;

function clampInt(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

const SELECTION_BROADCAST_MS = clampInt(
  process.env.REACT_APP_COEDITING_SELECTION_BROADCAST_MS,
  200,
  { min: 80, max: 2000 }
);

function createSessionId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return `live-${window.crypto.randomUUID()}`;
  }
  return `live-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function createOpId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return `op-${window.crypto.randomUUID()}`;
  }
  return `op-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function uniqueNodeIds(nodeIds) {
  return Array.from(new Set((nodeIds || [])
    .map((nodeId) => String(nodeId || '').trim())
    .filter(Boolean)))
    .slice(0, MAX_SELECTION_IDS);
}

function buildDraftEnvelope(draft, baseVersion, { mapId, actorId, sessionId }) {
  return {
    opId: draft.opId,
    mapId,
    sessionId,
    actorId,
    baseVersion,
    timestamp: draft.timestamp,
    type: draft.type,
    payload: draft.payload,
  };
}

function limitCommittedIds(committedIdsRef, opId) {
  if (!opId) return;
  const nextSet = committedIdsRef.current;
  nextSet.add(opId);
  if (nextSet.size <= 200) return;
  const items = Array.from(nextSet);
  nextSet.clear();
  items.slice(items.length - 120).forEach((item) => nextSet.add(item));
}

export function useCoeditingLive({
  enabled,
  mapId,
  actorId,
  canEdit,
  accessMode = 'edit',
  getLocalDocument,
  applyDocument,
  onCommittedOperation,
  onWarn,
}) {
  const [status, setStatus] = useState(STATUS.DISABLED);
  const [statusDetail, setStatusDetail] = useState('');
  const [liveVersion, setLiveVersion] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [participants, setParticipants] = useState([]);

  const statusRef = useRef(STATUS.DISABLED);
  const socketRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const sessionIdRef = useRef('');
  const manualStopRef = useRef(false);
  const joiningRef = useRef(false);
  const authoritativeDocumentRef = useRef(null);
  const pendingDraftsRef = useRef([]);
  const inFlightOpIdRef = useRef('');
  const flushInProgressRef = useRef(false);
  const committedOpIdsRef = useRef(new Set());
  const currentMapIdRef = useRef(mapId || null);
  const selectionNodeIdsRef = useRef([]);
  const selectionTimerRef = useRef(null);
  const heartbeatIntervalSecRef = useRef(DEFAULT_HEARTBEAT_SEC);
  const hydrateFromServerRef = useRef(null);
  const scheduleReconnectRef = useRef(null);
  const markOutOfSyncRef = useRef(null);
  const onCommittedOperationRef = useRef(onCommittedOperation);
  const participantsRef = useRef([]);

  const setLiveStatus = useCallback((nextStatus, nextDetail) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    if (nextDetail !== undefined) {
      setStatusDetail(nextDetail);
    }
  }, []);

  const applyOptimisticDocument = useCallback(() => {
    const authoritative = authoritativeDocumentRef.current;
    if (!authoritative) return false;

    let nextDocument = normalizeLiveDocument(authoritative);
    let nextVersion = nextDocument.version;

    for (const draft of pendingDraftsRef.current) {
      const operation = buildDraftEnvelope(draft, nextVersion, {
        mapId,
        actorId,
        sessionId: sessionIdRef.current,
      });
      nextDocument = applyOperationToDocument(nextDocument, operation);
      nextVersion += 1;
      nextDocument.version = nextVersion;
      nextDocument.lastOpId = operation.opId;
      nextDocument.lastActorId = operation.actorId;
    }

    applyDocument(nextDocument, { source: 'coediting' });
    setLiveVersion(authoritativeDocumentRef.current.version || 0);
    setPendingCount(pendingDraftsRef.current.length);
    return true;
  }, [actorId, applyDocument, mapId]);

  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const cleanupSocket = useCallback(() => {
    resetHeartbeat();
    const socket = socketRef.current;
    socketRef.current = null;
    joiningRef.current = false;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close();
    } catch {
      // Ignore close errors during cleanup.
    }
  }, [resetHeartbeat]);

  const markOutOfSync = useCallback((message) => {
    setLiveStatus(STATUS.OUT_OF_SYNC, message || 'Live document needs a full resync.');
    resetHeartbeat();
    clearReconnectTimer();
  }, [clearReconnectTimer, resetHeartbeat, setLiveStatus]);

  const resetState = useCallback(() => {
    manualStopRef.current = true;
    clearReconnectTimer();
    cleanupSocket();
    authoritativeDocumentRef.current = null;
    pendingDraftsRef.current = [];
    inFlightOpIdRef.current = '';
    committedOpIdsRef.current = new Set();
    selectionNodeIdsRef.current = [];
    if (selectionTimerRef.current) {
      window.clearTimeout(selectionTimerRef.current);
      selectionTimerRef.current = null;
    }
    participantsRef.current = [];
    setParticipants([]);
    setPendingCount(0);
    setLiveVersion(0);
    setLiveStatus(STATUS.DISABLED, '');
    reconnectAttemptRef.current = 0;
  }, [cleanupSocket, clearReconnectTimer, setLiveStatus]);

  const publishAuthoritativeDocument = useCallback((document) => {
    authoritativeDocumentRef.current = normalizeLiveDocument(document);
    setLiveVersion(authoritativeDocumentRef.current.version || 0);
    applyOptimisticDocument();
  }, [applyOptimisticDocument]);

  const removePendingDraft = useCallback((opId) => {
    const nextDrafts = pendingDraftsRef.current.filter((draft) => draft.opId !== opId);
    const changed = nextDrafts.length !== pendingDraftsRef.current.length;
    pendingDraftsRef.current = nextDrafts;
    if (inFlightOpIdRef.current === opId) {
      inFlightOpIdRef.current = '';
    }
    if (changed) {
      setPendingCount(nextDrafts.length);
    }
    return changed;
  }, []);

  const hydrateFromServer = useCallback(async ({ preferReplay = false } = {}) => {
    if (!enabled || !mapId) return false;

    if (preferReplay && authoritativeDocumentRef.current) {
      try {
        const { replay } = await getCoeditingReplay(mapId, {
          afterVersion: authoritativeDocumentRef.current.version || 0,
        });
        const operations = Array.isArray(replay?.operations) ? replay.operations : [];
        const currentVersion = Number.isInteger(replay?.currentVersion)
          ? replay.currentVersion
          : authoritativeDocumentRef.current.version || 0;

        if (operations.length === 0 && currentVersion === (authoritativeDocumentRef.current.version || 0)) {
          applyOptimisticDocument();
          return true;
        }

        if (operations.length === 0 || currentVersion < (authoritativeDocumentRef.current.version || 0)) {
          throw new Error('Replay gap detected');
        }

        const nextDocument = replayOperations(authoritativeDocumentRef.current, operations);
        nextDocument.version = currentVersion;
        nextDocument.lastOpId = operations[operations.length - 1]?.opId || nextDocument.lastOpId || null;
        nextDocument.lastActorId = operations[operations.length - 1]?.actorId || nextDocument.lastActorId || null;
        publishAuthoritativeDocument(nextDocument);
        return true;
      } catch (error) {
        if (error?.status === 404) {
          throw error;
        }
      }
    }

    const { liveDocument } = await getCoeditingLiveDocument(mapId);
    publishAuthoritativeDocument({
      ...liveDocument,
      mapId,
    });
    return true;
  }, [applyOptimisticDocument, enabled, mapId, publishAuthoritativeDocument]);

  const applyCommittedOperation = useCallback((operation, {
    fallbackActorId = null,
    liveDocumentSummary = null,
  } = {}) => {
    if (!operation?.opId) return false;

    removePendingDraft(operation.opId);

    // The same committed op can arrive over the socket before the ingest call resolves.
    // Only fold it into the authoritative document once.
    if (committedOpIdsRef.current.has(operation.opId)) {
      applyOptimisticDocument();
      return false;
    }

    const currentDocument = authoritativeDocumentRef.current || getLocalDocument();
    const nextAuthoritative = applyOperationToDocument(currentDocument, operation);
    nextAuthoritative.version = Number.isInteger(operation.version)
      ? operation.version
      : (currentDocument.version || 0) + 1;
    nextAuthoritative.lastOpId = operation.opId;
    nextAuthoritative.lastActorId = operation.actorId || fallbackActorId || currentDocument.lastActorId || null;
    if (liveDocumentSummary && typeof liveDocumentSummary === 'object') {
      if (Number.isInteger(liveDocumentSummary.version)) {
        nextAuthoritative.version = liveDocumentSummary.version;
      }
      if (Object.prototype.hasOwnProperty.call(liveDocumentSummary, 'mapUpdatedAt')) {
        nextAuthoritative.mapUpdatedAt = liveDocumentSummary.mapUpdatedAt || null;
      }
      if (typeof liveDocumentSummary.name === 'string' && liveDocumentSummary.name.trim()) {
        nextAuthoritative.name = liveDocumentSummary.name;
      }
      if (Object.prototype.hasOwnProperty.call(liveDocumentSummary, 'notes')) {
        nextAuthoritative.notes = liveDocumentSummary.notes ?? null;
      }
      if (liveDocumentSummary.lastOpId) {
        nextAuthoritative.lastOpId = liveDocumentSummary.lastOpId;
      }
      if (liveDocumentSummary.lastActorId) {
        nextAuthoritative.lastActorId = liveDocumentSummary.lastActorId;
      }
    }
    authoritativeDocumentRef.current = normalizeLiveDocument(nextAuthoritative);
    limitCommittedIds(committedOpIdsRef, operation.opId);
    applyOptimisticDocument();
    return true;
  }, [applyOptimisticDocument, getLocalDocument, removePendingDraft]);

  const flushQueue = useCallback(async () => {
    if (!enabled || !canEdit || !mapId || !actorId) return;
    if (statusRef.current !== STATUS.CONNECTED) return;
    if (!authoritativeDocumentRef.current) return;
    if (flushInProgressRef.current) return;
    if (inFlightOpIdRef.current) return;
    const draft = pendingDraftsRef.current[0];
    if (!draft) return;

    flushInProgressRef.current = true;
    const operation = buildDraftEnvelope(draft, authoritativeDocumentRef.current.version || 0, {
      mapId,
      actorId,
      sessionId: sessionIdRef.current,
    });
    inFlightOpIdRef.current = draft.opId;

    try {
      const { operation: committedOperation, liveDocument } = await ingestCoeditingOperation(mapId, operation);
      if (committedOperation?.opId) {
        applyCommittedOperation(committedOperation, {
          fallbackActorId: actorId,
          liveDocumentSummary: liveDocument,
        });
      }
    } catch (error) {
      inFlightOpIdRef.current = '';
      if (error?.code === 'COEDITING_READ_ONLY_FALLBACK') {
        markOutOfSync('Live editing is temporarily read-only');
        onWarn?.('Live editing is temporarily read-only for this map.');
        return;
      }
      if (error?.status === 409) {
        try {
          await hydrateFromServer({ preferReplay: true });
          return;
        } catch (resyncError) {
          markOutOfSync(resyncError?.message || error.message || 'Failed to resync live document');
          return;
        }
      }
      markOutOfSync(error?.message || 'Failed to commit live operation');
      onWarn?.(error?.message || 'Failed to commit live operation');
    } finally {
      flushInProgressRef.current = false;
      if (
        enabled
        && statusRef.current === STATUS.CONNECTED
        && pendingDraftsRef.current.length > 0
        && !inFlightOpIdRef.current
      ) {
        window.setTimeout(() => {
          flushQueue();
        }, 0);
      }
    }
  }, [actorId, applyCommittedOperation, canEdit, enabled, hydrateFromServer, mapId, markOutOfSync, onWarn]);

  const acceptCommittedOperation = useCallback((operation, options = {}) => {
    if (!operation?.opId) return false;

    try {
      return applyCommittedOperation(operation, options);
    } catch (error) {
      markOutOfSync(error?.message || 'Failed to apply a committed live operation');
      return false;
    }
  }, [applyCommittedOperation, markOutOfSync]);

  const sendSocketJson = useCallback((payload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  const broadcastSelectionNow = useCallback(() => {
    selectionTimerRef.current = null;
    if (!enabled || !sessionIdRef.current || !joiningRef.current) return;
    sendSocketJson({
      type: 'selection.update',
      selectedNodeIds: uniqueNodeIds(selectionNodeIdsRef.current),
    });
  }, [enabled, sendSocketJson]);

  const openLiveSocket = useCallback(({ requireJoin = false } = {}) => {
    if (!enabled || !mapId) return Promise.resolve(false);

    return new Promise((resolve, reject) => {
      let settled = false;
      let joined = false;
      let joinTimer = null;
      let socket = null;

      const settle = (value, error = null) => {
        if (settled) return;
        settled = true;
        if (joinTimer) {
          window.clearTimeout(joinTimer);
          joinTimer = null;
        }
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      };

      const closeSocketSilently = () => {
        if (!socket) return;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        try {
          socket.close();
        } catch {
          // Ignore close errors during retry cleanup.
        }
      };

      if (requireJoin) {
        joinTimer = window.setTimeout(() => {
          closeSocketSilently();
          joiningRef.current = false;
          settle(false, new Error('Timed out while rejoining live editing'));
        }, JOIN_TIMEOUT_MS);
      }

      try {
        socket = openCoeditingSocket(mapId);
        socketRef.current = socket;
      } catch (error) {
        settle(false, error);
        return;
      }

      socket.onopen = () => {
        setLiveStatus(STATUS.CONNECTING, 'Joining live room…');
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (!message?.type) return;

          if (message.type === 'welcome') {
            heartbeatIntervalSecRef.current = message.heartbeatIntervalSec || DEFAULT_HEARTBEAT_SEC;
            sendSocketJson({
              type: 'join',
              sessionId: sessionIdRef.current,
              clientName: CLIENT_NAME,
              accessMode,
            });
            return;
          }

          if (message.type === 'joined') {
            joiningRef.current = true;
            joined = true;
            reconnectAttemptRef.current = 0;
            const roomMode = String(message.roomMode || '').trim().toLowerCase();
            const isReadOnlyRoom = roomMode === 'read_only';
            const isReadOnlyViewer = isReadOnlyRoom && !canEdit;
            participantsRef.current = Array.isArray(message.participants) ? message.participants : [];
            setLiveStatus(
              isReadOnlyRoom && canEdit ? STATUS.OUT_OF_SYNC : STATUS.CONNECTED,
              isReadOnlyViewer
                ? 'Read-only live updates'
                : (isReadOnlyRoom ? 'Live editing is temporarily read-only' : 'Connected')
            );
            setParticipants(participantsRef.current);
            resetHeartbeat();
            heartbeatTimerRef.current = window.setInterval(() => {
              sendSocketJson({ type: 'heartbeat' });
            }, (message.heartbeatIntervalSec || DEFAULT_HEARTBEAT_SEC) * 1000);
            broadcastSelectionNow();
            if (!isReadOnlyRoom) {
              flushQueue();
              settle(true);
            } else if (canEdit) {
              if (requireJoin) {
                settle(false, new Error('Live editing is temporarily read-only'));
              } else {
                settle(false);
              }
            } else {
              settle(true);
            }
            return;
          }

          if (message.type === 'presence.sync') {
            participantsRef.current = Array.isArray(message.participants) ? message.participants : [];
            setParticipants(participantsRef.current);
            return;
          }

          if (message.type === 'operation.committed') {
            const applied = acceptCommittedOperation(message.operation, {
              liveDocumentSummary: message.liveDocument,
            });
            if (applied) {
              onCommittedOperationRef.current?.(message.operation, {
                participant: participantsRef.current.find(
                  (participant) => participant?.actorId && participant.actorId === message.operation?.actorId
                ) || null,
              });
            }
            return;
          }

          if (message.type === 'session.replaced') {
            cleanupSocket();
            scheduleReconnectRef.current?.({ immediate: true });
            return;
          }

          if (message.type === 'error') {
            if (message.code === 'COEDITING_READ_ONLY_FALLBACK') {
              markOutOfSync('Live editing is temporarily read-only');
              return;
            }
            if (message.error) {
              setStatusDetail(message.error);
            }
          }
        } catch {
          // Ignore invalid messages and let heartbeat/reconnect recover.
        }
      };

      socket.onerror = () => {
        setStatusDetail('Socket error');
      };

      socket.onclose = () => {
        joiningRef.current = false;
        if (requireJoin && !joined) {
          settle(false, new Error('Failed to rejoin live editing'));
          return;
        }
        if (!manualStopRef.current) {
          scheduleReconnectRef.current?.();
        }
        if (!joined) {
          settle(false);
        }
      };
    });
  }, [
    acceptCommittedOperation,
    accessMode,
    broadcastSelectionNow,
    canEdit,
    cleanupSocket,
    enabled,
    flushQueue,
    mapId,
    markOutOfSync,
    resetHeartbeat,
    sendSocketJson,
    setLiveStatus,
  ]);

  const scheduleReconnect = useCallback(({ immediate = false, refreshBeforeConnect = true } = {}) => {
    if (!enabled || manualStopRef.current) return;
    clearReconnectTimer();
    cleanupSocket();
    setLiveStatus(STATUS.RECONNECTING, 'Reconnecting to live editing…');
    const attempt = Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1);
    const delay = immediate ? 0 : RECONNECT_DELAYS_MS[attempt];
    if (!immediate) {
      reconnectAttemptRef.current += 1;
    }
    reconnectTimerRef.current = window.setTimeout(async () => {
      reconnectTimerRef.current = null;
      try {
        if (refreshBeforeConnect) {
          await hydrateFromServer();
        }
        await openLiveSocket();
      } catch (error) {
        if (!manualStopRef.current) {
          setStatusDetail(error?.message || 'Reconnecting to live editing…');
          scheduleReconnectRef.current?.();
        }
      }
    }, delay);
  }, [cleanupSocket, clearReconnectTimer, enabled, hydrateFromServer, openLiveSocket, setLiveStatus]);

  useEffect(() => {
    currentMapIdRef.current = mapId || null;
  }, [mapId]);

  useEffect(() => {
    hydrateFromServerRef.current = hydrateFromServer;
  }, [hydrateFromServer]);

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  useEffect(() => {
    markOutOfSyncRef.current = markOutOfSync;
  }, [markOutOfSync]);

  useEffect(() => {
    onCommittedOperationRef.current = onCommittedOperation;
  }, [onCommittedOperation]);

  useEffect(() => {
    if (!enabled || !mapId || !actorId) {
      resetState();
      return undefined;
    }

    let disposed = false;
    manualStopRef.current = false;
    if (!sessionIdRef.current) {
      sessionIdRef.current = createSessionId();
    }

    setLiveStatus(STATUS.CONNECTING, 'Loading live document…');

    hydrateFromServerRef.current()
      .then(() => {
        if (disposed || manualStopRef.current || currentMapIdRef.current !== mapId) return;
        scheduleReconnectRef.current?.({ refreshBeforeConnect: false });
      })
      .catch((error) => {
        if (disposed || manualStopRef.current || currentMapIdRef.current !== mapId) return;
        markOutOfSyncRef.current?.(error?.message || 'Failed to load live document');
      });

    return () => {
      disposed = true;
      manualStopRef.current = true;
      clearReconnectTimer();
      cleanupSocket();
      if (selectionTimerRef.current) {
        window.clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
    };
  }, [accessMode, actorId, canEdit, cleanupSocket, clearReconnectTimer, enabled, mapId, resetState, setLiveStatus]);

  const submitDraft = useCallback(({ type, payload }) => {
    if (!enabled || !mapId || !actorId || !canEdit) {
      return { ok: false, error: 'Live editing is not available for this map.' };
    }
    if (statusRef.current === STATUS.OUT_OF_SYNC || !authoritativeDocumentRef.current) {
      return { ok: false, error: 'Live document is not ready. Resync before editing again.' };
    }

    const draft = {
      opId: createOpId(),
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    pendingDraftsRef.current = [...pendingDraftsRef.current, draft];
    setPendingCount(pendingDraftsRef.current.length);

    try {
      applyOptimisticDocument();
    } catch (error) {
      pendingDraftsRef.current = pendingDraftsRef.current.filter((entry) => entry.opId !== draft.opId);
      setPendingCount(pendingDraftsRef.current.length);
      const message = error instanceof CoeditingDocumentError
        ? error.message
        : 'Failed to stage live operation';
      markOutOfSync(message);
      return { ok: false, error: message };
    }

    if (statusRef.current === STATUS.CONNECTED) {
      window.setTimeout(() => {
        flushQueue();
      }, 0);
    }

    return { ok: true, opId: draft.opId };
  }, [actorId, applyOptimisticDocument, canEdit, enabled, flushQueue, mapId, markOutOfSync]);

  const updateSelection = useCallback((nodeIds) => {
    selectionNodeIdsRef.current = uniqueNodeIds(nodeIds);
    if (!enabled || !joiningRef.current) return;
    if (selectionTimerRef.current) return;
    selectionTimerRef.current = window.setTimeout(broadcastSelectionNow, SELECTION_BROADCAST_MS);
  }, [broadcastSelectionNow, enabled]);

  const resync = useCallback(async () => {
    if (!enabled || !mapId) return false;
    try {
      clearReconnectTimer();
      cleanupSocket();
      reconnectAttemptRef.current = 0;
      setLiveStatus(STATUS.RECONNECTING, 'Resyncing live document…');
      await hydrateFromServer();
      return await openLiveSocket({ requireJoin: true });
    } catch (error) {
      markOutOfSync(error?.message || 'Failed to resync live document');
      return false;
    }
  }, [cleanupSocket, clearReconnectTimer, enabled, hydrateFromServer, mapId, markOutOfSync, openLiveSocket, setLiveStatus]);

  const resetToDocument = useCallback((document) => {
    if (!enabled || !mapId || !document) return false;
    const nextDocument = normalizeLiveDocument({
      ...document,
      mapId,
    });
    authoritativeDocumentRef.current = nextDocument;
    pendingDraftsRef.current = [];
    inFlightOpIdRef.current = '';
    setPendingCount(0);
    setLiveVersion(nextDocument.version || 0);
    applyDocument(nextDocument, { source: 'coediting' });

    const socket = socketRef.current;
    const isConnected = joiningRef.current && socket?.readyState === WebSocket.OPEN;
    setLiveStatus(
      isConnected ? STATUS.CONNECTED : STATUS.RECONNECTING,
      isConnected ? 'Connected' : 'Resynced from saved map'
    );
    if (isConnected) {
      flushQueue();
    } else {
      scheduleReconnect();
    }
    return true;
  }, [applyDocument, enabled, flushQueue, mapId, scheduleReconnect, setLiveStatus]);

  const remoteSelections = useMemo(() => {
    const currentSessionId = sessionIdRef.current;
    return (participants || []).filter(
      (participant) => participant?.sessionId && participant.sessionId !== currentSessionId
    );
  }, [participants]);

  return {
    liveStatus: status,
    liveStatusDetail: statusDetail,
    liveVersion,
    pendingCount,
    participants,
    remoteSelections,
    sessionId: sessionIdRef.current,
    canSubmit: enabled && canEdit && status !== STATUS.OUT_OF_SYNC,
    isLiveActive: enabled && !!mapId,
    submitDraft,
    updateSelection,
    resync,
    resetToDocument,
  };
}

export { STATUS as COEDITING_LIVE_STATUS };
