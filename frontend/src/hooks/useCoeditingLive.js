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
  getLocalDocument,
  applyDocument,
  onWarn,
}) {
  const [status, setStatus] = useState(STATUS.DISABLED);
  const [statusDetail, setStatusDetail] = useState('');
  const [liveVersion, setLiveVersion] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [participants, setParticipants] = useState([]);

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
    setStatus(STATUS.OUT_OF_SYNC);
    setStatusDetail(message || 'Live document needs a full resync.');
    resetHeartbeat();
    clearReconnectTimer();
  }, [clearReconnectTimer, resetHeartbeat]);

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
    setParticipants([]);
    setPendingCount(0);
    setLiveVersion(0);
    setStatus(STATUS.DISABLED);
    setStatusDetail('');
    reconnectAttemptRef.current = 0;
  }, [cleanupSocket, clearReconnectTimer]);

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

  const flushQueue = useCallback(async () => {
    if (!enabled || !canEdit || !mapId || !actorId) return;
    if (status !== STATUS.CONNECTED) return;
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
      const { operation: committedOperation } = await ingestCoeditingOperation(mapId, operation);
      if (committedOperation?.opId) {
        limitCommittedIds(committedOpIdsRef, committedOperation.opId);
        const currentDocument = authoritativeDocumentRef.current || getLocalDocument();
        const nextAuthoritative = applyOperationToDocument(currentDocument, committedOperation);
        nextAuthoritative.version = Number.isInteger(committedOperation.version)
          ? committedOperation.version
          : (currentDocument.version || 0) + 1;
        nextAuthoritative.lastOpId = committedOperation.opId;
        nextAuthoritative.lastActorId = committedOperation.actorId || actorId;
        authoritativeDocumentRef.current = normalizeLiveDocument(nextAuthoritative);
        removePendingDraft(committedOperation.opId);
        applyOptimisticDocument();
      }
    } catch (error) {
      inFlightOpIdRef.current = '';
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
      if (enabled && status === STATUS.CONNECTED && pendingDraftsRef.current.length > 0 && !inFlightOpIdRef.current) {
        window.setTimeout(() => {
          flushQueue();
        }, 0);
      }
    }
  }, [actorId, applyOptimisticDocument, canEdit, enabled, getLocalDocument, hydrateFromServer, mapId, markOutOfSync, onWarn, removePendingDraft, status]);

  const acceptCommittedOperation = useCallback((operation) => {
    if (!operation?.opId) return false;
    removePendingDraft(operation.opId);
    if (committedOpIdsRef.current.has(operation.opId)) {
      applyOptimisticDocument();
      return false;
    }

    try {
      const currentDocument = authoritativeDocumentRef.current || getLocalDocument();
      const nextAuthoritative = applyOperationToDocument(currentDocument, operation);
      nextAuthoritative.version = Number.isInteger(operation.version)
        ? operation.version
        : (currentDocument.version || 0) + 1;
      nextAuthoritative.lastOpId = operation.opId;
      nextAuthoritative.lastActorId = operation.actorId || currentDocument.lastActorId || null;
      authoritativeDocumentRef.current = normalizeLiveDocument(nextAuthoritative);
      limitCommittedIds(committedOpIdsRef, operation.opId);
      applyOptimisticDocument();
      return true;
    } catch (error) {
      markOutOfSync(error?.message || 'Failed to apply a committed live operation');
      return false;
    }
  }, [applyOptimisticDocument, getLocalDocument, markOutOfSync, removePendingDraft]);

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

  const scheduleReconnect = useCallback(() => {
    if (!enabled || manualStopRef.current) return;
    clearReconnectTimer();
    resetHeartbeat();
    setStatus(STATUS.RECONNECTING);
    setStatusDetail('Reconnecting to live editing…');
    const attempt = Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1);
    const delay = RECONNECT_DELAYS_MS[attempt];
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = window.setTimeout(async () => {
      try {
        await hydrateFromServer({ preferReplay: true });
      } catch (error) {
        markOutOfSync(error?.message || 'Failed to resync live document');
        return;
      }
      try {
        const socket = openCoeditingSocket(mapId);
        socketRef.current = socket;

        socket.onopen = () => {
          setStatus(STATUS.CONNECTING);
          setStatusDetail('Joining live room…');
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
                accessMode: 'edit',
              });
              return;
            }

            if (message.type === 'joined') {
              joiningRef.current = true;
              reconnectAttemptRef.current = 0;
              setStatus(STATUS.CONNECTED);
              setStatusDetail('Connected');
              setParticipants(Array.isArray(message.participants) ? message.participants : []);
              resetHeartbeat();
              heartbeatTimerRef.current = window.setInterval(() => {
                sendSocketJson({ type: 'heartbeat' });
              }, (message.heartbeatIntervalSec || DEFAULT_HEARTBEAT_SEC) * 1000);
              broadcastSelectionNow();
              flushQueue();
              return;
            }

            if (message.type === 'presence.sync') {
              setParticipants(Array.isArray(message.participants) ? message.participants : []);
              return;
            }

            if (message.type === 'operation.committed') {
              acceptCommittedOperation(message.operation);
              return;
            }

            if (message.type === 'session.replaced') {
              cleanupSocket();
              scheduleReconnect();
              return;
            }

            if (message.type === 'error') {
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
          scheduleReconnect();
        };
      } catch (error) {
        markOutOfSync(error?.message || 'Failed to open live transport');
      }
    }, delay);
  }, [acceptCommittedOperation, broadcastSelectionNow, cleanupSocket, clearReconnectTimer, enabled, flushQueue, hydrateFromServer, mapId, markOutOfSync, resetHeartbeat, sendSocketJson]);

  useEffect(() => {
    currentMapIdRef.current = mapId || null;
  }, [mapId]);

  useEffect(() => {
    if (!enabled || !mapId || !actorId || !canEdit) {
      resetState();
      return undefined;
    }

    manualStopRef.current = false;
    if (!sessionIdRef.current) {
      sessionIdRef.current = createSessionId();
    }

    setStatus(STATUS.CONNECTING);
    setStatusDetail('Loading live document…');

    hydrateFromServer()
      .then(() => {
        scheduleReconnect();
      })
      .catch((error) => {
        markOutOfSync(error?.message || 'Failed to load live document');
      });

    return () => {
      manualStopRef.current = true;
      clearReconnectTimer();
      cleanupSocket();
      if (selectionTimerRef.current) {
        window.clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
    };
  }, [actorId, canEdit, cleanupSocket, clearReconnectTimer, enabled, hydrateFromServer, mapId, markOutOfSync, resetState, scheduleReconnect]);

  const submitDraft = useCallback(({ type, payload }) => {
    if (!enabled || !mapId || !actorId || !canEdit) {
      return { ok: false, error: 'Live editing is not available for this map.' };
    }
    if (status === STATUS.OUT_OF_SYNC || !authoritativeDocumentRef.current) {
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

    if (status === STATUS.CONNECTED) {
      window.setTimeout(() => {
        flushQueue();
      }, 0);
    }

    return { ok: true, opId: draft.opId };
  }, [actorId, applyOptimisticDocument, canEdit, enabled, flushQueue, mapId, markOutOfSync, status]);

  const updateSelection = useCallback((nodeIds) => {
    selectionNodeIdsRef.current = uniqueNodeIds(nodeIds);
    if (!enabled || !joiningRef.current) return;
    if (selectionTimerRef.current) return;
    selectionTimerRef.current = window.setTimeout(broadcastSelectionNow, SELECTION_BROADCAST_MS);
  }, [broadcastSelectionNow, enabled]);

  const resync = useCallback(async () => {
    if (!enabled || !mapId) return false;
    try {
      setStatus(STATUS.RECONNECTING);
      setStatusDetail('Resyncing live document…');
      await hydrateFromServer();
      setStatus(joiningRef.current ? STATUS.CONNECTED : STATUS.RECONNECTING);
      setStatusDetail(joiningRef.current ? 'Connected' : 'Reconnecting to live editing…');
      if (!socketRef.current || socketRef.current.readyState > WebSocket.OPEN) {
        scheduleReconnect();
      } else {
        flushQueue();
      }
      return true;
    } catch (error) {
      markOutOfSync(error?.message || 'Failed to resync live document');
      return false;
    }
  }, [enabled, flushQueue, hydrateFromServer, mapId, markOutOfSync, scheduleReconnect]);

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
  };
}

export { STATUS as COEDITING_LIVE_STATUS };
