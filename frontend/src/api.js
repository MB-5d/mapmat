/**
 * API service for Map Mat frontend
 */

import { API_BASE } from './utils/constants';

const AUTH_TOKEN_KEY = 'mapmat_auth_token';

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function getStoredAuthToken() {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredAuthToken(token) {
  if (!canUseStorage()) return;
  try {
    if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // Ignore storage errors in private mode/blocked storage scenarios.
  }
}

function clearStoredAuthToken() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Ignore storage errors.
  }
}

// Fetch wrapper with credentials and error handling
async function fetchJson(endpoint, options = {}, { includeUserToken = true } = {}) {
  const authToken = includeUserToken ? getStoredAuthToken() : null;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include', // Include cookies
    headers,
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Unexpected server response');
  }

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.code = data.code || null;
    error.payload = data;
    throw error;
  }

  return data;
}

async function fetchApi(endpoint, options = {}) {
  return fetchJson(endpoint, options, { includeUserToken: true });
}

async function fetchAdminApi(endpoint, options = {}) {
  return fetchJson(endpoint, options, { includeUserToken: false });
}

function buildWebSocketUrl(endpoint) {
  const baseUrl = new URL(API_BASE);
  const protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${baseUrl.host}${endpoint}`;
}

// ============================================
// AUTH
// ============================================

export async function signup(email, password, name) {
  const result = await fetchApi('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
  if (result?.token) setStoredAuthToken(result.token);
  return result;
}

export async function login(email, password) {
  const result = await fetchApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (result?.token) setStoredAuthToken(result.token);
  return result;
}

export async function logout() {
  try {
    return await fetchApi('/auth/logout', { method: 'POST' });
  } finally {
    clearStoredAuthToken();
  }
}

export async function getMe() {
  return fetchApi('/auth/me');
}

export async function updateProfile(data) {
  return fetchApi('/auth/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function uploadMyAvatar({ imageDataUrl }) {
  return fetchApi('/auth/me/avatar', {
    method: 'POST',
    body: JSON.stringify({ imageDataUrl }),
  });
}

export async function removeMyAvatar() {
  return fetchApi('/auth/me/avatar', {
    method: 'DELETE',
  });
}

export async function deleteAccount(password) {
  const result = await fetchApi('/auth/me', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
  clearStoredAuthToken();
  return result;
}

export async function getAdminSession() {
  return fetchAdminApi('/api/admin/session');
}

export async function createAdminSession({ operatorLabel, adminKey }) {
  return fetchAdminApi('/api/admin/session', {
    method: 'POST',
    body: JSON.stringify({ operatorLabel, adminKey }),
  });
}

export async function destroyAdminSession() {
  return fetchAdminApi('/api/admin/session', {
    method: 'DELETE',
  });
}

export async function getAdminUsers({
  query = '',
  limit,
  offset,
  sortBy = 'updatedAt',
  sortDirection = 'desc',
} = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (limit !== undefined && limit !== null) params.set('limit', String(limit));
  if (offset !== undefined && offset !== null) params.set('offset', String(offset));
  params.set('sortBy', sortBy);
  params.set('sortDirection', sortDirection);
  return fetchAdminApi(`/api/admin/users?${params.toString()}`);
}

export async function getAdminUser(userId) {
  return fetchAdminApi(`/api/admin/users/${encodeURIComponent(userId)}`);
}

export async function adminResetUserPassword(userId, { newPassword }) {
  return fetchAdminApi(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
}

export async function adminDisableUser(userId, { reason } = {}) {
  return fetchAdminApi(`/api/admin/users/${encodeURIComponent(userId)}/disable`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function adminReactivateUser(userId) {
  return fetchAdminApi(`/api/admin/users/${encodeURIComponent(userId)}/reactivate`, {
    method: 'POST',
  });
}

// ============================================
// PROJECTS
// ============================================

export async function getProjects() {
  return fetchApi('/api/projects');
}

export async function getProjectsPage({ limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  const query = params.toString();
  return fetchApi(`/api/projects${query ? `?${query}` : ''}`);
}

export async function createProject(name) {
  return fetchApi('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function updateProject(id, name) {
  return fetchApi(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function deleteProject(id) {
  return fetchApi(`/api/projects/${id}`, { method: 'DELETE' });
}

// ============================================
// MAPS
// ============================================

export async function getMaps(projectId) {
  const query = projectId ? `?project_id=${projectId}` : '';
  return fetchApi(`/api/maps${query}`);
}

export async function getMapsPage(projectId, { limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (projectId) params.set('project_id', projectId);
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  const query = params.toString();
  return fetchApi(`/api/maps${query ? `?${query}` : ''}`);
}

export async function getMap(id) {
  return fetchApi(`/api/maps/${id}`);
}

export async function saveMap(data) {
  return fetchApi('/api/maps', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMap(id, data, { expectedUpdatedAt } = {}) {
  const payload = {
    ...(data || {}),
  };
  if (expectedUpdatedAt) {
    payload.expected_updated_at = expectedUpdatedAt;
  }
  return fetchApi(`/api/maps/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteMap(id) {
  return fetchApi(`/api/maps/${id}`, { method: 'DELETE' });
}

export async function getMapVersions(mapId) {
  return fetchApi(`/api/maps/${mapId}/versions`);
}

export async function createMapVersion(mapId, payload) {
  return fetchApi(`/api/maps/${mapId}/versions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getMapComments(mapId) {
  return fetchApi(`/api/maps/${mapId}/comments`);
}

export async function createMapComment(mapId, { nodeId, parentCommentId = null, text } = {}) {
  return fetchApi(`/api/maps/${mapId}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      node_id: nodeId,
      parent_comment_id: parentCommentId,
      text,
    }),
  });
}

export async function updateMapComment(mapId, commentId, payload = {}) {
  return fetchApi(`/api/maps/${mapId}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteMapComment(mapId, commentId) {
  return fetchApi(`/api/maps/${mapId}/comments/${commentId}`, {
    method: 'DELETE',
  });
}

export async function getMapActivity(mapId, { limit = 25, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  return fetchApi(`/api/maps/${mapId}/activity?${params.toString()}`);
}

export async function getCoeditingLiveDocument(mapId) {
  return fetchApi(`/api/maps/${mapId}/live-document`);
}

export async function getCoeditingReplay(mapId, { afterVersion = 0, limit } = {}) {
  const params = new URLSearchParams();
  params.set('afterVersion', String(afterVersion));
  if (limit !== undefined) params.set('limit', String(limit));
  return fetchApi(`/api/maps/${mapId}/ops/replay?${params.toString()}`);
}

export async function ingestCoeditingOperation(mapId, operation) {
  return fetchApi(`/api/maps/${mapId}/ops/ingest`, {
    method: 'POST',
    body: JSON.stringify({ operation }),
  });
}

export function openCoeditingSocket(mapId) {
  const url = buildWebSocketUrl(`/api/maps/${mapId}/realtime/socket`);
  const token = getStoredAuthToken();
  if (!token) {
    return new WebSocket(url);
  }
  return new WebSocket(url, ['mapmat-auth', token]);
}

// ============================================
// HISTORY
// ============================================

export async function getHistory(limitOrOptions = 50, maybeOffset = 0) {
  let limit = 50;
  let offset = 0;
  if (typeof limitOrOptions === 'object' && limitOrOptions !== null) {
    limit = limitOrOptions.limit ?? 50;
    offset = limitOrOptions.offset ?? 0;
  } else {
    limit = limitOrOptions;
    offset = maybeOffset || 0;
  }
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  return fetchApi(`/api/history?${params.toString()}`);
}

export async function addToHistory(data) {
  return fetchApi('/api/history', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateHistory(id, data) {
  return fetchApi(`/api/history/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteHistory(ids) {
  return fetchApi('/api/history', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
}

// ============================================
// BACKGROUND JOBS
// ============================================

export async function createScanJob(payload) {
  return fetchApi('/scan-jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getScanJob(id, { includeResult = true } = {}) {
  const query = includeResult ? '' : '?include_result=false';
  return fetchApi(`/scan-jobs/${id}${query}`);
}

export async function cancelScanJob(id) {
  return fetchApi(`/scan-jobs/${id}/cancel`, { method: 'POST' });
}

export async function createScreenshotJob(payload) {
  return fetchApi('/screenshot-jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getScreenshotJob(id, { includeResult = true } = {}) {
  const query = includeResult ? '' : '?include_result=false';
  return fetchApi(`/screenshot-jobs/${id}${query}`);
}

export async function cancelScreenshotJob(id) {
  return fetchApi(`/screenshot-jobs/${id}/cancel`, { method: 'POST' });
}

// ============================================
// COLLABORATION
// ============================================

export async function getMapCollaboration(mapId) {
  return fetchApi(`/api/maps/${mapId}/collaboration`);
}

export async function updateMapCollaborationSettings(mapId, payload = {}) {
  return fetchApi(`/api/maps/${mapId}/collaboration/settings`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function createMapInvite(mapId, { email, role, expiresInDays } = {}) {
  return fetchApi(`/api/maps/${mapId}/invites`, {
    method: 'POST',
    body: JSON.stringify({
      email,
      role,
      expires_in_days: expiresInDays,
    }),
  });
}

export async function acceptMapInvite(token) {
  return fetchApi(`/api/collaboration/invites/${token}/accept`, {
    method: 'POST',
  });
}

export async function getPendingMapInvites() {
  return fetchApi('/api/collaboration/invites');
}

export async function getPendingAccessRequests() {
  return fetchApi('/api/collaboration/access-requests');
}

export async function acceptMapInviteById(inviteId) {
  return fetchApi(`/api/collaboration/invites/id/${inviteId}/accept`, {
    method: 'POST',
  });
}

export async function declineMapInviteById(inviteId) {
  return fetchApi(`/api/collaboration/invites/id/${inviteId}/decline`, {
    method: 'POST',
  });
}

export async function revokeMapInvite(mapId, inviteId) {
  return fetchApi(`/api/maps/${mapId}/invites/${inviteId}`, {
    method: 'DELETE',
  });
}

export async function updateMapMemberRole(mapId, userId, role) {
  return fetchApi(`/api/maps/${mapId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function removeMapMember(mapId, userId) {
  return fetchApi(`/api/maps/${mapId}/members/${userId}`, {
    method: 'DELETE',
  });
}

export async function reviewMapAccessRequest(mapId, requestId, { status, role } = {}) {
  return fetchApi(`/api/maps/${mapId}/access-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, role }),
  });
}

export async function createMapAccessRequest(mapId, { requestedRole = 'viewer', message } = {}) {
  return fetchApi(`/api/maps/${mapId}/access-requests`, {
    method: 'POST',
    body: JSON.stringify({
      requested_role: requestedRole,
      message,
    }),
  });
}

export async function getMapFeatureGates(mapId) {
  return fetchApi(`/api/maps/${mapId}/feature-gates`);
}

// ============================================
// REALTIME BASELINE (PRESENCE)
// ============================================

export async function getMapPresence(mapId) {
  return fetchApi(`/api/maps/${mapId}/presence`);
}

export async function sendMapPresenceHeartbeat(
  mapId,
  { sessionId, accessMode, clientName = 'web', metadata } = {}
) {
  return fetchApi(`/api/maps/${mapId}/presence/heartbeat`, {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      access_mode: accessMode,
      client_name: clientName,
      metadata,
    }),
  });
}

export async function leaveMapPresence(mapId, sessionId) {
  return fetchApi(`/api/maps/${mapId}/presence/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

// ============================================
// SHARES
// ============================================

export async function createShare(data) {
  return fetchApi('/api/shares', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getShare(id) {
  return fetchApi(`/api/shares/${id}`);
}

export async function getMyShares() {
  return fetchApi('/api/shares');
}

export async function getMySharesPage({ limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  const query = params.toString();
  return fetchApi(`/api/shares${query ? `?${query}` : ''}`);
}

export async function deleteShare(id) {
  return fetchApi(`/api/shares/${id}`, { method: 'DELETE' });
}
