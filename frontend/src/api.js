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
async function fetchApi(endpoint, options = {}) {
  const authToken = getStoredAuthToken();
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
    throw new Error(data.error || 'Request failed');
  }

  return data;
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

export async function deleteAccount(password) {
  const result = await fetchApi('/auth/me', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
  clearStoredAuthToken();
  return result;
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

export async function updateMap(id, data) {
  return fetchApi(`/api/maps/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
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
