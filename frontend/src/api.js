/**
 * API service for Vellic frontend
 */

import { API_BASE } from './utils/constants';

const AUTH_TOKEN_KEY = 'vellic_auth_token';
const LEGACY_AUTH_TOKEN_KEY = 'mapmat_auth_token';
const COEDITING_AUTH_PROTOCOL = 'vellic-auth';

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function getStoredAuthToken() {
  if (!canUseStorage()) return null;
  try {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) return token;
    const legacyToken = window.localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
    if (legacyToken) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, legacyToken);
      window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    }
    return legacyToken;
  } catch {
    return null;
  }
}

function setStoredAuthToken(token) {
  if (!canUseStorage()) return;
  try {
    if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch {
    // Ignore storage errors in private mode/blocked storage scenarios.
  }
}

function clearStoredAuthToken() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
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

async function fetchBlob(endpoint, { includeUserToken = true } = {}) {
  const authToken = includeUserToken ? getStoredAuthToken() : null;
  const headers = {};

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const error = new Error(payload?.error || 'Request failed');
    error.status = response.status;
    throw error;
  }

  return response.blob();
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  return fetchApi('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export async function login(email, password) {
  const result = await fetchApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (result?.token) setStoredAuthToken(result.token);
  return result;
}

export async function verifyEmail(email, code) {
  const result = await fetchApi('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  if (result?.token) setStoredAuthToken(result.token);
  return result;
}

export async function resendVerification(email) {
  return fetchApi('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function forgotPassword(email) {
  return fetchApi('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(email, code, newPassword) {
  const result = await fetchApi('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword }),
  });
  if (result?.token) setStoredAuthToken(result.token);
  return result;
}

export async function getAuthConfig() {
  return fetchJson('/auth/config', {}, { includeUserToken: false });
}

export function getGoogleAuthStartUrl(nextPath = null) {
  const params = new URLSearchParams();
  if (nextPath) {
    params.set('next', nextPath);
  }
  const search = params.toString();
  return `${API_BASE}/auth/google/start${search ? `?${search}` : ''}`;
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

export async function deleteAccount(password = '') {
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

export async function createAdminSession({ email, password }) {
  return fetchAdminApi('/api/admin/session', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
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

export async function getAdminFeedback({
  query = '',
  limit = 100,
  offset = 0,
  status = '',
  intent = '',
  scope = '',
  componentKey = '',
  unassigned = false,
} = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (limit !== undefined && limit !== null) params.set('limit', String(limit));
  if (offset !== undefined && offset !== null) params.set('offset', String(offset));
  if (status) params.set('status', status);
  if (intent) params.set('intent', intent);
  if (scope) params.set('scope', scope);
  if (componentKey) params.set('componentKey', componentKey);
  if (unassigned) params.set('unassigned', 'true');
  return fetchAdminApi(`/api/admin/feedback?${params.toString()}`);
}

export async function updateAdminFeedback(feedbackId, payload = {}) {
  return fetchAdminApi(`/api/admin/feedback/${encodeURIComponent(feedbackId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getAdminFeedbackThemes({
  query = '',
  limit = 100,
  offset = 0,
  status = '',
  priorityBucket = '',
  severity = '',
} = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (limit !== undefined && limit !== null) params.set('limit', String(limit));
  if (offset !== undefined && offset !== null) params.set('offset', String(offset));
  if (status) params.set('status', status);
  if (priorityBucket) params.set('priorityBucket', priorityBucket);
  if (severity) params.set('severity', severity);
  return fetchAdminApi(`/api/admin/feedback/themes?${params.toString()}`);
}

export async function createAdminFeedbackTheme(payload = {}) {
  return fetchAdminApi('/api/admin/feedback/themes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAdminFeedbackTheme(themeId, payload = {}) {
  return fetchAdminApi(`/api/admin/feedback/themes/${encodeURIComponent(themeId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function downloadAdminFeedbackExport() {
  const blob = await fetchBlob('/api/admin/feedback/export.csv', { includeUserToken: false });
  triggerBlobDownload(blob, 'vellic-feedback-items.csv');
}

export async function downloadAdminFeedbackThemeExport() {
  const blob = await fetchBlob('/api/admin/feedback/themes/export.csv', { includeUserToken: false });
  triggerBlobDownload(blob, 'vellic-feedback-themes.csv');
}

export async function submitFeedback(payload = {}) {
  return fetchApi('/api/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
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
  return new WebSocket(url, [COEDITING_AUTH_PROTOCOL, token]);
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

export async function getHistoryInsights(id) {
  return fetchApi(`/api/history/${id}/insights`);
}

export async function analyzeInsights(data) {
  return fetchApi('/api/insights/analyze', {
    method: 'POST',
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

function buildScanJobPath(id, { includeResult = true, accessToken = null, suffix = '' } = {}) {
  const params = new URLSearchParams();
  if (!includeResult) params.set('include_result', 'false');
  if (accessToken) params.set('access_token', accessToken);
  const query = params.toString();
  return `/scan-jobs/${id}${suffix}${query ? `?${query}` : ''}`;
}

export async function createScanJob(payload) {
  return fetchApi('/scan-jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getScanJob(id, { includeResult = true, accessToken = null } = {}) {
  return fetchApi(buildScanJobPath(id, { includeResult, accessToken }));
}

export function getScanJobStreamUrl(id, { accessToken = null } = {}) {
  return `${API_BASE}${buildScanJobPath(id, { accessToken, suffix: '/stream' })}`;
}

export async function cancelScanJob(id, { accessToken = null } = {}) {
  const body = accessToken ? JSON.stringify({ access_token: accessToken }) : undefined;
  return fetchApi(buildScanJobPath(id, { suffix: '/cancel' }), {
    method: 'POST',
    ...(body ? { body } : {}),
  });
}

export async function stopScanJob(id, { accessToken = null } = {}) {
  const body = accessToken ? JSON.stringify({ access_token: accessToken }) : undefined;
  return fetchApi(buildScanJobPath(id, { suffix: '/stop' }), {
    method: 'POST',
    ...(body ? { body } : {}),
  });
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
