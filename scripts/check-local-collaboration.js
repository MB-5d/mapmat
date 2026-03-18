#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');

const API_BASE = String(process.env.API_BASE || 'http://localhost:4002').replace(/\/$/, '');
const WS_BASE = API_BASE.replace(/^http/i, 'ws');
const REQUEST_TIMEOUT_MS = clampInt(process.env.COLLAB_CHECK_TIMEOUT_MS, 10000, { min: 1000, max: 60000 });
const CLEANUP = parseEnvBool(process.env.COLLAB_CHECK_CLEANUP, true);

function clampInt(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function createRunId() {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${suffix}`;
}

function createOperation({ mapId, actorId, sessionId, baseVersion, type, payload }) {
  return {
    opId: `op-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    mapId,
    actorId,
    sessionId,
    baseVersion,
    timestamp: new Date().toISOString(),
    type,
    payload,
  };
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

function mergeCookieHeader(existingHeader, responseHeaders) {
  const nextPairs = new Map();
  const loadPair = (cookie) => {
    const firstSegment = String(cookie || '').split(';')[0].trim();
    if (!firstSegment) return;
    const separatorIndex = firstSegment.indexOf('=');
    if (separatorIndex === -1) return;
    const key = firstSegment.slice(0, separatorIndex).trim();
    const value = firstSegment.slice(separatorIndex + 1).trim();
    if (!key) return;
    nextPairs.set(key, `${key}=${value}`);
  };

  String(existingHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach(loadPair);

  getSetCookies(responseHeaders).forEach(loadPair);

  return Array.from(nextPairs.values()).join('; ');
}

async function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }
    return { response, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

class ApiSession {
  constructor(label, runId) {
    this.label = label;
    this.password = 'Admin123!';
    this.email = `codex-collab+${runId}-${label}@example.com`;
    this.name = `Codex ${label}`;
    this.token = '';
    this.cookieHeader = '';
    this.user = null;
  }

  authHeaders(extra = {}) {
    const headers = { ...extra };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    if (this.cookieHeader) {
      headers.Cookie = this.cookieHeader;
    }
    return headers;
  }

  async request(path, { method = 'GET', body, expectedStatus, expectedStatuses } = {}) {
    const headers = this.authHeaders();
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const { response, data } = await requestJson(`${API_BASE}${path}`, {
      method,
      headers,
      body: payload,
    });

    this.cookieHeader = mergeCookieHeader(this.cookieHeader, response.headers);
    if (data?.token && !this.token) {
      this.token = data.token;
    }

    const allowed = expectedStatuses || (expectedStatus !== undefined ? [expectedStatus] : []);
    if (allowed.length > 0 && !allowed.includes(response.status)) {
      const detail = data?.error || JSON.stringify(data);
      throw new Error(`${this.label} ${method} ${path} -> ${response.status} (${detail})`);
    }

    return { status: response.status, data };
  }

  async signup() {
    const result = await this.request('/auth/signup', {
      method: 'POST',
      body: {
        email: this.email,
        password: this.password,
        name: this.name,
      },
      expectedStatus: 200,
    });
    this.user = result.data.user;
    if (result.data?.token) {
      this.token = result.data.token;
    }
    assert.ok(this.user?.id, `${this.label} should receive a user id`);
    return this.user;
  }

  async deleteAccount() {
    return this.request('/auth/me', {
      method: 'DELETE',
      body: { password: this.password },
      expectedStatus: 200,
    });
  }
}

function logStep(message, details = null) {
  if (details) {
    console.log(`[collab-check] ${message}`, details);
    return;
  }
  console.log(`[collab-check] ${message}`);
}

function waitForMessage(socketState, predicate, timeoutMs = REQUEST_TIMEOUT_MS) {
  const existing = socketState.messages.find(predicate);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      socketState.listeners.delete(listener);
      reject(new Error(`Timed out waiting for socket message on ${socketState.label}`));
    }, timeoutMs);

    const listener = (message) => {
      if (!predicate(message)) return;
      clearTimeout(timeoutId);
      socketState.listeners.delete(listener);
      resolve(message);
    };

    socketState.listeners.add(listener);
  });
}

async function openJoinedSocket(session, mapId, accessMode) {
  const socketUrl = `${WS_BASE}/api/maps/${mapId}/realtime/socket`;
  const socket = session.token
    ? new WebSocket(socketUrl, ['mapmat-auth', session.token])
    : new WebSocket(socketUrl);

  const socketState = {
    label: `${session.label}:${accessMode}`,
    socket,
    messages: [],
    listeners: new Set(),
  };

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    socketState.messages.push(message);
    for (const listener of socketState.listeners) {
      listener(message);
    }
  });

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`Timed out opening socket for ${session.label}`)), REQUEST_TIMEOUT_MS);
    socket.addEventListener('open', () => {
      clearTimeout(timeoutId);
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timeoutId);
      reject(new Error(`Socket open failed for ${session.label}`));
    }, { once: true });
    socket.addEventListener('close', (event) => {
      clearTimeout(timeoutId);
      reject(new Error(`Socket closed before open for ${session.label}: ${event.code}`));
    }, { once: true });
  });

  const welcome = await waitForMessage(socketState, (message) => message.type === 'welcome');
  socket.send(JSON.stringify({
    type: 'join',
    sessionId: `${session.label}-${Date.now().toString(36)}`,
    clientName: 'collab-check',
    accessMode,
  }));
  const joined = await waitForMessage(socketState, (message) => message.type === 'joined');

  return {
    ...socketState,
    welcome,
    joined,
    async waitForType(type) {
      return waitForMessage(socketState, (message) => message.type === type);
    },
    close() {
      try {
        socket.close();
      } catch {
        // Ignore close failures during cleanup.
      }
    },
  };
}

async function expectSocketDenied(session, mapId) {
  const socketUrl = `${WS_BASE}/api/maps/${mapId}/realtime/socket`;
  const socket = session.token
    ? new WebSocket(socketUrl, ['mapmat-auth', session.token])
    : new WebSocket(socketUrl);

  return new Promise((resolve, reject) => {
    let opened = false;
    const timeoutId = setTimeout(() => {
      reject(new Error(`Expected socket denial for ${session.label}`));
    }, REQUEST_TIMEOUT_MS);

    socket.addEventListener('open', () => {
      opened = true;
      clearTimeout(timeoutId);
      reject(new Error(`Socket unexpectedly opened for ${session.label}`));
    }, { once: true });

    socket.addEventListener('error', () => {
      // Some runtimes emit error before close for failed handshakes.
    });

    socket.addEventListener('close', (event) => {
      clearTimeout(timeoutId);
      if (opened) {
        reject(new Error(`Socket unexpectedly opened for ${session.label}`));
        return;
      }
      resolve(event.code);
    }, { once: true });
  });
}

async function main() {
  const runId = createRunId();
  const owner = new ApiSession('owner', runId);
  const editor = new ApiSession('editor', runId);
  const viewer = new ApiSession('viewer', runId);
  const commenter = new ApiSession('commenter', runId);

  const cleanupSessions = [commenter, viewer, editor, owner];
  const cleanupSockets = [];
  let mapId = '';

  try {
    logStep('Creating test accounts');
    await owner.signup();
    await editor.signup();
    await viewer.signup();
    await commenter.signup();

    const { data: projectPayload } = await owner.request('/api/projects', {
      method: 'POST',
      body: { name: `Collab Check ${runId}` },
      expectedStatus: 200,
    });
    const projectId = projectPayload.project.id;

    const rootNode = {
      id: 'root',
      title: 'Collab Root',
      url: 'https://example.com',
      children: [],
    };

    const { data: mapPayload } = await owner.request('/api/maps', {
      method: 'POST',
      body: {
        name: `Collab Map ${runId}`,
        url: rootNode.url,
        root: rootNode,
        orphans: [],
        connections: [],
        colors: ['#111111'],
        connectionColors: { crossLinks: '#222222' },
        project_id: projectId,
      },
      expectedStatus: 200,
    });
    mapId = mapPayload.map.id;
    assert.ok(mapId, 'owner should receive a saved map id');
    logStep('Created owner project and map', { projectId, mapId });

    const { data: ownerFeatureGates } = await owner.request(`/api/maps/${mapId}/feature-gates`, {
      expectedStatus: 200,
    });
    assert.strictEqual(ownerFeatureGates.permissions.role, 'owner');
    assert.strictEqual(ownerFeatureGates.permissions.features.mapEdit, true);
    assert.strictEqual(ownerFeatureGates.permissions.features.collabInviteSend, true);

    const { data: editorInvitePayload } = await owner.request(`/api/maps/${mapId}/invites`, {
      method: 'POST',
      body: { email: editor.email, role: 'editor' },
      expectedStatus: 200,
    });
    const { data: viewerInvitePayload } = await owner.request(`/api/maps/${mapId}/invites`, {
      method: 'POST',
      body: { email: viewer.email, role: 'viewer' },
      expectedStatus: 200,
    });

    await editor.request(`/api/collaboration/invites/${editorInvitePayload.invite.token}/accept`, {
      method: 'POST',
      expectedStatus: 200,
    });
    await viewer.request(`/api/collaboration/invites/${viewerInvitePayload.invite.token}/accept`, {
      method: 'POST',
      expectedStatus: 200,
    });
    logStep('Accepted owner-created editor/viewer invites');

    const { data: commenterInvitePayload } = await editor.request(`/api/maps/${mapId}/invites`, {
      method: 'POST',
      body: { email: commenter.email, role: 'commenter' },
      expectedStatus: 200,
    });
    await commenter.request(`/api/collaboration/invites/${commenterInvitePayload.invite.token}/accept`, {
      method: 'POST',
      expectedStatus: 200,
    });
    logStep('Accepted editor-created commenter invite');

    const { data: ownerCollab } = await owner.request(`/api/maps/${mapId}/collaboration`, {
      expectedStatus: 200,
    });
    assert.strictEqual(ownerCollab.collaboration.memberships.length, 3);
    assert.strictEqual(ownerCollab.collaboration.invites.length, 0);

    await editor.request(`/api/maps/${mapId}/collaboration`, { expectedStatus: 200 });
    await viewer.request(`/api/maps/${mapId}/collaboration`, { expectedStatus: 404 });
    await commenter.request(`/api/maps/${mapId}/collaboration`, { expectedStatus: 404 });

    const { data: editorMaps } = await editor.request('/api/maps', { expectedStatus: 200 });
    const { data: viewerMaps } = await viewer.request('/api/maps', { expectedStatus: 200 });
    const { data: commenterMaps } = await commenter.request('/api/maps', { expectedStatus: 200 });
    assert.ok(editorMaps.maps.some((map) => map.id === mapId), 'editor should see shared map in list');
    assert.ok(viewerMaps.maps.some((map) => map.id === mapId), 'viewer should see shared map in list');
    assert.ok(commenterMaps.maps.some((map) => map.id === mapId), 'commenter should see shared map in list');

    await editor.request(`/api/maps/${mapId}`, { expectedStatus: 200 });
    await viewer.request(`/api/maps/${mapId}`, { expectedStatus: 200 });
    await commenter.request(`/api/maps/${mapId}`, { expectedStatus: 200 });
    logStep('Verified shared map list/read access across roles');

    const { data: editorFeatureGates } = await editor.request(`/api/maps/${mapId}/feature-gates`, {
      expectedStatus: 200,
    });
    const { data: viewerFeatureGates } = await viewer.request(`/api/maps/${mapId}/feature-gates`, {
      expectedStatus: 200,
    });
    const { data: commenterFeatureGates } = await commenter.request(`/api/maps/${mapId}/feature-gates`, {
      expectedStatus: 200,
    });

    assert.strictEqual(editorFeatureGates.permissions.role, 'editor');
    assert.strictEqual(editorFeatureGates.permissions.features.mapEdit, true);
    assert.strictEqual(editorFeatureGates.permissions.features.collabInviteSend, true);
    assert.strictEqual(viewerFeatureGates.permissions.role, 'viewer');
    assert.strictEqual(viewerFeatureGates.permissions.features.mapEdit, false);
    assert.strictEqual(viewerFeatureGates.permissions.features.mapComment, false);
    assert.strictEqual(commenterFeatureGates.permissions.role, 'commenter');
    assert.strictEqual(commenterFeatureGates.permissions.features.mapEdit, false);
    assert.strictEqual(commenterFeatureGates.permissions.features.mapComment, true);
    logStep('Verified role-based feature gates', {
      editor: editorFeatureGates.permissions.coediting.mode,
      viewer: viewerFeatureGates.permissions.coediting.mode,
      commenter: commenterFeatureGates.permissions.coediting.mode,
    });

    await owner.request(`/api/maps/${mapId}/presence/heartbeat`, {
      method: 'POST',
      body: { session_id: `presence-${runId}-owner`, access_mode: 'edit', client_name: 'collab-check' },
      expectedStatus: 200,
    });
    await editor.request(`/api/maps/${mapId}/presence/heartbeat`, {
      method: 'POST',
      body: { session_id: `presence-${runId}-editor`, access_mode: 'edit', client_name: 'collab-check' },
      expectedStatus: 200,
    });
    await viewer.request(`/api/maps/${mapId}/presence/heartbeat`, {
      method: 'POST',
      body: { session_id: `presence-${runId}-viewer`, access_mode: 'view', client_name: 'collab-check' },
      expectedStatus: 200,
    });
    await commenter.request(`/api/maps/${mapId}/presence/heartbeat`, {
      method: 'POST',
      body: { session_id: `presence-${runId}-commenter`, access_mode: 'comment', client_name: 'collab-check' },
      expectedStatus: 200,
    });

    const { data: presencePayload } = await owner.request(`/api/maps/${mapId}/presence`, {
      expectedStatus: 200,
    });
    assert.strictEqual(presencePayload.presence.sessions.length, 4);
    logStep('Verified presence sessions', {
      count: presencePayload.presence.sessions.length,
    });

    await owner.request(`/api/maps/${mapId}/live-document`, { expectedStatus: 200 });
    await editor.request(`/api/maps/${mapId}/live-document`, { expectedStatus: 200 });
    await viewer.request(`/api/maps/${mapId}/live-document`, { expectedStatus: 200 });
    await commenter.request(`/api/maps/${mapId}/live-document`, { expectedStatus: 200 });
    await owner.request(`/api/maps/${mapId}/ops/replay?afterVersion=0`, { expectedStatus: 200 });

    const ownerSocket = await openJoinedSocket(owner, mapId, 'edit');
    const editorSocket = await openJoinedSocket(editor, mapId, 'edit');
    cleanupSockets.push(ownerSocket, editorSocket);
    assert.strictEqual(ownerSocket.joined.roomMode, 'enabled');
    assert.strictEqual(editorSocket.joined.roomMode, 'enabled');

    await expectSocketDenied(viewer, mapId);
    await expectSocketDenied(commenter, mapId);
    logStep('Verified WebSocket room access for writer vs read-only roles');

    const ownerOp = createOperation({
      mapId,
      actorId: owner.user.id,
      sessionId: ownerSocket.joined.sessionId,
      baseVersion: 0,
      type: 'metadata.update',
      payload: {
        changes: {
          name: `Collab Map ${runId} Updated`,
        },
      },
    });
    const editorCommitPromise = waitForMessage(
      editorSocket,
      (message) => message.type === 'operation.committed' && message.operation?.opId === ownerOp.opId
    );
    const { data: ownerIngest } = await owner.request(`/api/maps/${mapId}/ops/ingest`, {
      method: 'POST',
      body: { operation: ownerOp },
      expectedStatus: 201,
    });
    assert.strictEqual(ownerIngest.operation.version, 1);
    const editorCommit = await editorCommitPromise;
    assert.strictEqual(editorCommit.operation.opId, ownerOp.opId);

    const editorOp = createOperation({
      mapId,
      actorId: editor.user.id,
      sessionId: editorSocket.joined.sessionId,
      baseVersion: 1,
      type: 'node.add',
      payload: {
        nodeId: `node-${runId}`,
        parentId: 'root',
        afterNodeId: null,
        node: {
          id: `node-${runId}`,
          title: 'Editor Page',
          url: 'https://example.com/editor',
          children: [],
        },
      },
    });
    const ownerCommitPromise = waitForMessage(
      ownerSocket,
      (message) => message.type === 'operation.committed' && message.operation?.opId === editorOp.opId
    );
    const { data: editorIngest } = await editor.request(`/api/maps/${mapId}/ops/ingest`, {
      method: 'POST',
      body: { operation: editorOp },
      expectedStatus: 201,
    });
    assert.strictEqual(editorIngest.operation.version, 2);
    const ownerCommit = await ownerCommitPromise;
    assert.strictEqual(ownerCommit.operation.opId, editorOp.opId);

    await viewer.request(`/api/maps/${mapId}/ops/ingest`, {
      method: 'POST',
      body: { operation: createOperation({
        mapId,
        actorId: viewer.user.id,
        sessionId: 'viewer-denied',
        baseVersion: 2,
        type: 'metadata.update',
        payload: { changes: { notes: 'viewer should fail' } },
      }) },
      expectedStatus: 404,
    });
    await commenter.request(`/api/maps/${mapId}/ops/ingest`, {
      method: 'POST',
      body: { operation: createOperation({
        mapId,
        actorId: commenter.user.id,
        sessionId: 'commenter-denied',
        baseVersion: 2,
        type: 'metadata.update',
        payload: { changes: { notes: 'commenter should fail' } },
      }) },
      expectedStatus: 404,
    });
    logStep('Verified live ingest writes for owner/editor and read-only denial for viewer/commenter');

    const { data: updatedViewerMembership } = await owner.request(`/api/maps/${mapId}/members/${viewer.user.id}`, {
      method: 'PATCH',
      body: { role: 'commenter' },
      expectedStatus: 200,
    });
    assert.strictEqual(updatedViewerMembership.membership.role, 'commenter');

    const { data: viewerPromotedFeatureGates } = await viewer.request(`/api/maps/${mapId}/feature-gates`, {
      expectedStatus: 200,
    });
    assert.strictEqual(viewerPromotedFeatureGates.permissions.role, 'commenter');
    assert.strictEqual(viewerPromotedFeatureGates.permissions.features.mapComment, true);
    assert.strictEqual(viewerPromotedFeatureGates.permissions.features.mapEdit, false);

    await viewer.request(`/api/maps/${mapId}/presence/${encodeURIComponent(`presence-${runId}-viewer`)}`, {
      method: 'DELETE',
      expectedStatus: 200,
    });
    await owner.request(`/api/maps/${mapId}/members/${viewer.user.id}`, {
      method: 'DELETE',
      expectedStatus: 200,
    });
    await viewer.request(`/api/maps/${mapId}`, { expectedStatus: 404 });
    await viewer.request(`/api/maps/${mapId}/presence/heartbeat`, {
      method: 'POST',
      body: { session_id: `presence-${runId}-viewer-removed`, access_mode: 'view', client_name: 'collab-check' },
      expectedStatus: 404,
    });
    await viewer.request(`/api/maps/${mapId}/live-document`, { expectedStatus: 404 });
    logStep('Verified membership role updates and access removal');

    console.log('[collab-check] Passed.', {
      apiBase: API_BASE,
      mapId,
      ownerId: owner.user.id,
      editorId: editor.user.id,
      commenterId: commenter.user.id,
      removedViewerId: viewer.user.id,
      finalVersion: editorIngest.liveDocument.version,
      cleanup: CLEANUP,
    });
  } finally {
    for (const socketState of cleanupSockets) {
      socketState.close();
    }

    if (!CLEANUP) {
      return;
    }

    if (mapId) {
      try {
        await owner.request(`/api/maps/${mapId}`, { method: 'DELETE', expectedStatus: 200 });
      } catch (error) {
        console.warn('[collab-check] Cleanup map delete failed:', error.message);
      }
    }

    for (const session of cleanupSessions) {
      try {
        if (session.user?.id) {
          await session.deleteAccount();
        }
      } catch (error) {
        console.warn(`[collab-check] Cleanup account delete failed for ${session.label}:`, error.message);
      }
    }
  }
}

main().catch((error) => {
  console.error('[collab-check] Failed:', error.message);
  process.exit(1);
});
