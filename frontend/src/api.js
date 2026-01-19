/**
 * API service for Map Mat frontend
 */

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';

// Fetch wrapper with credentials and error handling
async function fetchApi(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include', // Include cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
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
  return fetchApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return fetchApi('/auth/logout', { method: 'POST' });
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
  return fetchApi('/auth/me', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}

// ============================================
// PROJECTS
// ============================================

export async function getProjects() {
  return fetchApi('/api/projects');
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

// ============================================
// HISTORY
// ============================================

export async function getHistory(limit = 50) {
  return fetchApi(`/api/history?limit=${limit}`);
}

export async function addToHistory(data) {
  return fetchApi('/api/history', {
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

export async function deleteShare(id) {
  return fetchApi(`/api/shares/${id}`, { method: 'DELETE' });
}
