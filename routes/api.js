/**
 * API routes for Vellic - Projects, Maps, History, Shares
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const projectStore = require('../stores/projectStore');
const mapStore = require('../stores/mapStore');
const imageAssetStore = require('../stores/imageAssetStore');
const collaborationStore = require('../stores/collaborationStore');
const mapCommentStore = require('../stores/mapCommentStore');
const feedbackStore = require('../stores/feedbackStore');
const historyStore = require('../stores/historyStore');
const shareStore = require('../stores/shareStore');
const usageStore = require('../stores/usageStore');
const emailDeliveryStore = require('../stores/emailDeliveryStore');
const { authMiddleware, requireAuth } = require('./auth');
const permissionPolicy = require('../policies/permissionPolicy');
const {
  ACTIVITY_SCOPES,
  ACTIVITY_TYPES,
  ensureCollaborationActivitySchemaAsync,
  recordMapActivityBestEffortAsync,
} = require('../utils/collaborationActivity');
const {
  resolveCoeditingRolloutAsync,
  resolveCoeditingSystemStatusAsync,
  summarizeCoeditingRolloutConfigAsync,
} = require('../utils/coeditingRollout');
const { getCoeditingHealthSnapshotAsync } = require('../utils/coeditingObservability');
const { buildHealthSnapshot: getEmailHealthSnapshot } = require('../utils/emailProvider');
const { saveFeedbackImageFromDataUrl } = require('../utils/feedbackStorage');
const { analyzeMapInsights } = require('../utils/mapInsights');
const {
  extractScreenshotStorageKey,
  getContentTypeForKey,
  getScreenshotStorageProvider,
  readScreenshotJson,
  readScreenshotObject,
  saveScreenshotObject,
  statScreenshotObject,
} = require('../utils/screenshotStorage');
const {
  DOWNLOAD_IMAGE_FIELDS,
  buildImageDownloadDirectoryPaths,
  buildImageDownloadPackageName,
  buildImageDownloadPath,
  collectFallbackImageDownloadNodes,
  compareImageDownloadPaths,
  createZipBuffer,
  getAssetExtension,
  getDownloadSiteTitle,
  normalizeDownloadNodeDescriptors,
  orderImageDownloadZipEntries,
  sanitizeFilenamePart,
  sortImageDownloadEntries,
  urlsMatch,
} = require('../utils/imageDownloadPackage');

const router = express.Router();
const NODE_ASSET_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

function parseNodeAssetDataImage(imageDataUrl) {
  const match = String(imageDataUrl || '').match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    const error = new Error('Upload a PNG, JPG, or WebP image.');
    error.status = 400;
    throw error;
  }
  const contentType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) {
    const error = new Error('Uploaded image is empty.');
    error.status = 400;
    throw error;
  }
  if (buffer.length > NODE_ASSET_UPLOAD_MAX_BYTES) {
    const error = new Error('Choose an image under 4 MB.');
    error.status = 413;
    throw error;
  }
  const extension = contentType === 'image/png'
    ? 'png'
    : contentType === 'image/webp'
      ? 'webp'
      : 'jpg';
  return { buffer, contentType, extension };
}

function getNodeAssetUploadBaseUrl(req) {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return `${req.protocol}://${req.get('host')}`;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null;
const COLLABORATION_BACKEND_ENABLED = parseEnvBool(
  process.env.COLLABORATION_BACKEND_ENABLED,
  false
);

const FEATURE_GATES = Object.freeze({
  mapView: permissionPolicy.FEATURES.MAP_VIEW,
  activityView: permissionPolicy.FEATURES.ACTIVITY_VIEW,
  mapComment: permissionPolicy.FEATURES.MAP_COMMENT,
  mapEdit: permissionPolicy.FEATURES.MAP_EDIT,
  versionSave: permissionPolicy.FEATURES.VERSION_SAVE,
  historyManage: permissionPolicy.FEATURES.HISTORY_MANAGE,
  shareManage: permissionPolicy.FEATURES.SHARE_MANAGE,
  discoveryRun: permissionPolicy.FEATURES.DISCOVERY_RUN,
  collabPanelView: permissionPolicy.FEATURES.COLLAB_PANEL_VIEW,
  collabInviteSend: permissionPolicy.FEATURES.COLLAB_INVITE_SEND,
  collabSettingsManage: permissionPolicy.FEATURES.COLLAB_SETTINGS_MANAGE,
  accessRequestsView: permissionPolicy.FEATURES.ACCESS_REQUESTS_VIEW,
  accessRequestsCreate: permissionPolicy.FEATURES.ACCESS_REQUESTS_CREATE,
  presenceView: permissionPolicy.FEATURES.PRESENCE_VIEW,
});
const FEEDBACK_MESSAGE_MAX_LENGTH = 4000;

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function requireAdminKey(req, res, next) {
  if (!ADMIN_API_KEY) {
    return res.status(503).json({ error: 'Admin access not configured' });
  }
  const key = req.get('x-admin-key') || req.get('x-api-key') || req.query?.admin_key;
  if (key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

function parsePagination(query, { defaultLimit = DEFAULT_PAGE_SIZE, maxLimit = MAX_PAGE_SIZE } = {}) {
  const limitRaw = query?.limit;
  const offsetRaw = query?.offset;
  const parsedLimit = Number.parseInt(limitRaw, 10);
  const parsedOffset = Number.parseInt(offsetRaw, 10);

  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), maxLimit)
    : defaultLimit;
  const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

  return { limit, offset };
}

function parseWindowDays(raw, fallback = 30, max = 365) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

function parseJsonObject(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseBooleanLike(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function serializeFeedbackItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorUserId: row.actor_user_id || null,
    actorName: row.actor_name || '',
    actorEmail: row.actor_email || '',
    surface: row.surface || '',
    routePath: row.route_path || '',
    routeSection: row.route_section || '',
    mapId: row.map_id || null,
    shareId: row.share_id || null,
    scope: row.scope || 'whole_app',
    intent: row.intent || 'idea',
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    message: row.message || '',
    componentKey: row.component_key || null,
    componentLabel: row.component_label || null,
    domHint: parseJsonObject(row.dom_hint_json),
    screenshotPath: row.screenshot_path || null,
    allowFollowUp: Number(row.allow_follow_up || 0) > 0,
    triageStatus: row.triage_status || 'new',
    themeId: row.theme_id || null,
    context: parseJsonObject(row.context_json),
    themeTitle: row.theme_title || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function redactSensitiveFields(value) {
  const sensitiveKeys = new Set([
    'inviteToken',
    'token',
    'acceptToken',
    'authorization',
    'apiKey',
    'api_key',
  ]);

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveFields(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => {
      if (sensitiveKeys.has(key)) {
        return [key, '[redacted]'];
      }
      return [key, redactSensitiveFields(fieldValue)];
    })
  );
}

function serializeEmailDeliveryAdmin(row, { includeDebug = false } = {}) {
  if (!row) return null;

  const base = {
    id: row.id,
    jobId: row.job_id || null,
    mapId: row.map_id || null,
    inviteId: row.invite_id || null,
    templateKey: row.template_key,
    toEmail: row.to_email,
    fromEmail: row.from_email || null,
    replyToEmail: row.reply_to_email || null,
    subject: row.subject || null,
    provider: row.provider || null,
    status: row.status,
    attempts: Number(row.attempts || 0),
    lastAttemptAt: row.last_attempt_at || null,
    sentAt: row.sent_at || null,
    failedAt: row.failed_at || null,
    providerMessageId: row.provider_message_id || null,
    lastWebhookEventType: row.last_webhook_event_type || null,
    lastWebhookEventAt: row.last_webhook_event_at || null,
    error: row.error || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };

  if (!includeDebug) {
    return base;
  }

  return {
    ...base,
    payload: redactSensitiveFields(parseJsonObject(row.payload)),
    providerResponse: redactSensitiveFields(parseJsonObject(row.provider_response)),
  };
}

function serializeEmailDeliveryEventAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    eventSourceId: row.event_source_id || null,
    deliveryId: row.delivery_id || null,
    providerMessageId: row.provider_message_id || null,
    eventType: row.event_type,
    deliveryStatus: row.delivery_status || null,
    recipientEmail: row.recipient_email || null,
    occurredAt: row.occurred_at || null,
    payload: redactSensitiveFields(parseJsonObject(row.payload)),
    headers: redactSensitiveFields(parseJsonObject(row.headers)),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function parseCommentMentions(text) {
  return Array.from(
    new Set((String(text || '').match(/@(\w+)/g) || []).map((mention) => mention.slice(1)))
  );
}

// Safe JSON.parse wrapper — returns fallback for null/undefined,
// throws descriptive error if parsing fails.
function safeParse(raw, fieldName, fallback = undefined) {
  if (raw === null || raw === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required field: ${fieldName}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${fieldName}: ${e.message}`);
  }
}

function stripNodeForStorage(node) {
  if (!node || typeof node !== 'object') return node;
  const next = { ...node };
  delete next.internalLinks;
  delete next._childUrls;
  delete next._treeDepth;
  delete next._treeSize;
  if (Array.isArray(node.children)) {
    next.children = node.children.map(stripNodeForStorage);
  }
  return next;
}

function sanitizeMapTreeForStorage({ root, orphans } = {}) {
  return {
    root: root ? stripNodeForStorage(root) : root,
    orphans: Array.isArray(orphans) ? orphans.map(stripNodeForStorage) : orphans,
  };
}

// Shared parser for map/history/share rows that store JSON in *_data columns.
function parseMapFields(row) {
  return {
    root: safeParse(row.root_data, 'root_data'),
    orphans: safeParse(row.orphans_data, 'orphans_data', []),
    connections: safeParse(row.connections_data, 'connections_data', []),
    colors: safeParse(row.colors, 'colors', null),
    connectionColors: safeParse(row.connection_colors, 'connection_colors', null),
    insights: safeParse(row.insights_data, 'insights_data', null),
    insights_generated_at: row.insights_generated_at || null,
    root_data: undefined,
    orphans_data: undefined,
    connections_data: undefined,
    connection_colors: undefined,
    insights_data: undefined,
  };
}

const NODE_ASSET_STRING_FIELDS = new Set([
  'thumbnailUrl',
  'thumbnailFullUrl',
  'fullScreenshotUrl',
  'thumbnailCaptureError',
  'thumbnailCaptureFailedAt',
]);

const NODE_ASSET_BOOLEAN_FIELDS = new Set([
  'authRequired',
  'thumbnailCaptureFailed',
  'fullScreenshotTruncated',
]);

const NODE_ASSET_IMAGE_URL_FIELDS = new Set([
  'thumbnailUrl',
  'thumbnailFullUrl',
  'fullScreenshotUrl',
]);

function getNodeAssetManifestType(assetField, assets) {
  if (assetField === 'fullScreenshotUrl') return 'full';
  if (assetField === 'thumbnailFullUrl') return 'thumbnail_preview';
  if (assetField === 'thumbnailUrl' && assets?.fullScreenshotUrl) return 'full_thumbnail';
  return 'thumbnail';
}

function collectNodeAssetFields(root, orphans = []) {
  const assetsById = new Map();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const nodeId = String(node.id || '').trim();
    if (nodeId) {
      const assets = {};
      NODE_ASSET_STRING_FIELDS.forEach((field) => {
        if (typeof node[field] === 'string' && node[field].trim()) {
          assets[field] = node[field];
        }
      });
      NODE_ASSET_BOOLEAN_FIELDS.forEach((field) => {
        if (typeof node[field] === 'boolean') {
          assets[field] = node[field];
        }
      });
      if (Object.keys(assets).length > 0) {
        assetsById.set(nodeId, assets);
      }
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };

  visit(root);
  if (Array.isArray(orphans)) {
    orphans.forEach(visit);
  }
  return assetsById;
}

function collectNodesById(root, orphans = []) {
  const nodesById = new Map();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const nodeId = String(node.id || '').trim();
    if (nodeId) nodesById.set(nodeId, node);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(root);
  if (Array.isArray(orphans)) orphans.forEach(visit);
  return nodesById;
}

function stripStaleImageAssetFields(node) {
  if (!node || typeof node !== 'object') return node;
  let nextNode = node;
  [
    'thumbnailUrl',
    'thumbnailFullUrl',
    'fullScreenshotUrl',
    'thumbnailCaptureError',
    'thumbnailCaptureFailedAt',
    'thumbnailCaptureFailed',
    'fullScreenshotTruncated',
  ].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(nextNode, field)) {
      if (nextNode === node) nextNode = { ...node };
      delete nextNode[field];
    }
  });
  return nextNode;
}

function mergePreservedNodeAssets(node, assetsById, currentNodesById, result) {
  if (!node || typeof node !== 'object') return node;
  let nextNode = node;
  const nodeId = String(node.id || '').trim();
  const existingAssets = nodeId ? assetsById.get(nodeId) : null;
  const currentNode = nodeId ? currentNodesById.get(nodeId) : null;

  if (existingAssets && currentNode && !urlsMatch(currentNode.url || '', node.url || '')) {
    nextNode = stripStaleImageAssetFields(nextNode);
    result.changed = true;
    result.staleNodeIds.add(nodeId);
  } else if (existingAssets) {
    Object.entries(existingAssets).forEach(([field, value]) => {
      if (nextNode[field] !== value) {
        if (nextNode === node) nextNode = { ...node };
        nextNode[field] = value;
        result.changed = true;
      }
    });
  }

  if (Array.isArray(node.children)) {
    let childrenChanged = false;
    const nextChildren = node.children.map((child) => {
      const nextChild = mergePreservedNodeAssets(child, assetsById, currentNodesById, result);
      if (nextChild !== child) childrenChanged = true;
      return nextChild;
    });
    if (childrenChanged) {
      if (nextNode === node) nextNode = { ...node };
      nextNode.children = nextChildren;
    }
  }

  return nextNode;
}

function preserveExistingImageAssets({ root, orphans, currentRoot, currentOrphans }) {
  const assetsById = collectNodeAssetFields(currentRoot, currentOrphans);
  if (assetsById.size === 0) return { root, orphans, staleNodeIds: [] };

  const currentNodesById = collectNodesById(currentRoot, currentOrphans);
  const result = { changed: false, staleNodeIds: new Set() };
  return {
    root: root !== undefined ? mergePreservedNodeAssets(root, assetsById, currentNodesById, result) : root,
    orphans: Array.isArray(orphans)
      ? orphans.map((orphan) => mergePreservedNodeAssets(orphan, assetsById, currentNodesById, result))
      : orphans,
    staleNodeIds: Array.from(result.staleNodeIds),
  };
}

async function getVerifiedManifestAssetUpdatesById(mapId) {
  let rows = [];
  try {
    rows = await imageAssetStore.listSavedImageAssetsByMapAsync(mapId);
  } catch (error) {
    console.warn('Image asset manifest read error:', error.message);
    return new Map();
  }

  const updatesById = new Map();
  const missingEntries = [];
  const verifyRow = async (row) => {
    const nodeId = String(row.node_id || '').trim();
    const field = String(row.asset_field || '').trim();
    const url = String(row.url || '').trim();
    if (!nodeId || !NODE_ASSET_STRING_FIELDS.has(field) || !url) return null;

    const storageKey = String(row.storage_key || '').trim() || extractScreenshotStorageKey(url);
    const stats = storageKey ? await statScreenshotObject(storageKey) : null;
    if (!stats || Number(stats.size || 0) <= 0) {
      return {
        missing: {
          mapId,
          nodeId,
          assetField: field,
          assetType: row.asset_type || field,
          storageKey: storageKey || null,
          url,
          provider: row.provider || getScreenshotStorageProvider(),
          contentType: storageKey ? getContentTypeForKey(storageKey) : null,
          status: 'missing',
          error: 'Missing saved asset',
        },
      };
    }

    return { nodeId, field, url };
  };

  const validationConcurrency = 16;
  for (let start = 0; start < (rows || []).length; start += validationConcurrency) {
    const batch = rows.slice(start, start + validationConcurrency);
    const results = await Promise.all(batch.map(verifyRow));
    results.filter(Boolean).forEach((result) => {
      if (result.missing) {
        missingEntries.push(result.missing);
        return;
      }
      updatesById.set(result.nodeId, {
        ...(updatesById.get(result.nodeId) || {}),
        [result.field]: result.url,
      });
    });
  }

  if (missingEntries.length > 0) {
    imageAssetStore.markImageAssetsMissingAsync(missingEntries).catch((error) => {
      console.warn('Image asset manifest missing mark error:', error.message);
    });
  }

  return updatesById;
}

async function backfillMapImageAssetManifestFromTree(mapId, parsedMap) {
  const safeMapId = String(mapId || '').trim();
  if (!safeMapId) return 0;

  let existingRows = [];
  try {
    existingRows = await imageAssetStore.listImageAssetsByMapAsync(safeMapId);
  } catch (error) {
    console.warn('Image asset manifest backfill read error:', error.message);
    return 0;
  }

  const existingByNodeField = new Map(
    (existingRows || []).map((row) => [
      `${String(row.node_id || '').trim()}:${String(row.asset_field || '').trim()}`,
      row,
    ])
  );
  const assetsById = collectNodeAssetFields(parsedMap.root, parsedMap.orphans);
  if (assetsById.size === 0) return 0;

  const entries = [];
  for (const [nodeId, assets] of assetsById.entries()) {
    for (const [assetField, value] of Object.entries(assets || {})) {
      if (!NODE_ASSET_IMAGE_URL_FIELDS.has(assetField) || typeof value !== 'string' || !value.trim()) {
        continue;
      }

      const existing = existingByNodeField.get(`${nodeId}:${assetField}`);
      if (
        existing
        && String(existing.url || '').trim() === value.trim()
        && String(existing.status || '').trim() === 'saved'
      ) {
        continue;
      }

      const storageKey = extractScreenshotStorageKey(value);
      const stats = storageKey ? await statScreenshotObject(storageKey) : null;
      entries.push({
        mapId: safeMapId,
        nodeId,
        assetField,
        assetType: getNodeAssetManifestType(assetField, assets),
        storageKey: storageKey || null,
        url: value.trim(),
        provider: getScreenshotStorageProvider(),
        sizeBytes: stats?.size || null,
        contentType: storageKey ? getContentTypeForKey(storageKey) : null,
        status: stats && Number(stats.size || 0) > 0 ? 'saved' : 'missing',
        error: stats && Number(stats.size || 0) > 0 ? null : 'Missing saved asset',
        verifiedAt: new Date().toISOString(),
      });
    }
  }

  if (entries.length === 0) return 0;
  try {
    return await imageAssetStore.upsertImageAssetsAsync(entries);
  } catch (error) {
    console.warn('Image asset manifest backfill write error:', error.message);
    return 0;
  }
}

async function repairMapImageAssetsFromManifest(mapRow, { persist = false } = {}) {
  const parsed = parseMapFields(mapRow);
  await backfillMapImageAssetManifestFromTree(mapRow.id, parsed);
  const updatesById = await getVerifiedManifestAssetUpdatesById(mapRow.id);
  if (updatesById.size === 0) {
    return { row: mapRow, parsed, changed: false };
  }

  const nextMap = applyNodeAssetUpdatesToMapData({
    root: parsed.root,
    orphans: parsed.orphans,
    updatesById,
  });
  if (!nextMap.changed) {
    return { row: mapRow, parsed, changed: false };
  }

  const sanitizedTree = sanitizeMapTreeForStorage({
    root: nextMap.root,
    orphans: nextMap.orphans,
  });
  const nextRow = {
    ...mapRow,
    root_data: JSON.stringify(sanitizedTree.root),
    orphans_data: sanitizedTree.orphans ? JSON.stringify(sanitizedTree.orphans) : null,
  };

  if (persist) {
    await mapStore.updateMapByIdAsync(mapRow.id, {
      rootData: nextRow.root_data,
      orphansData: nextRow.orphans_data,
    });
  }

  return {
    row: nextRow,
    parsed: {
      ...parsed,
      root: sanitizedTree.root,
      orphans: sanitizedTree.orphans || [],
    },
    changed: true,
  };
}

function buildContentDisposition(filename) {
  const safeFilename = sanitizeFilenamePart(filename, 'download');
  const asciiFallback = sanitizeFilenamePart(
    safeFilename
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]+/g, '-'),
    'download'
  ).replace(/^[.-]+|[.-]+$/g, '') || 'download';
  const quoted = asciiFallback.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `attachment; filename="${quoted}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
}

function normalizeSelectedNodeIds(rawNodeIds) {
  return Array.from(new Set(
    (Array.isArray(rawNodeIds) ? rawNodeIds : [])
      .map((nodeId) => String(nodeId || '').trim())
      .filter(Boolean)
  ));
}

async function buildMapImageDownloadFiles({ mapId, parsedMap, scope, selectedNodeIds, clientNodes }) {
  const fallbackDescriptors = normalizeDownloadNodeDescriptors(
    collectFallbackImageDownloadNodes(parsedMap.root, parsedMap.orphans)
  );
  const clientDescriptors = normalizeDownloadNodeDescriptors(clientNodes);
  const currentNodesById = collectNodesById(parsedMap.root, parsedMap.orphans);
  const validNodeIds = new Set(currentNodesById.keys());
  const selectedSet = scope === 'selected' ? new Set(selectedNodeIds) : null;
  const exportableFields = new Set(DOWNLOAD_IMAGE_FIELDS);
  const siteTitle = getDownloadSiteTitle(parsedMap.root?.title || '');
  const getDescriptor = (nodeId) => {
    const node = currentNodesById.get(nodeId);
    return clientDescriptors.get(nodeId)
      || fallbackDescriptors.get(nodeId)
      || {
        id: nodeId,
        number: '',
        title: node?.title || '',
        url: node?.url || '',
        pathSegments: [],
      };
  };
  const scopedDescriptors = Array.from(validNodeIds)
    .filter((nodeId) => !selectedSet || selectedSet.has(nodeId))
    .map(getDescriptor);
  const directories = buildImageDownloadDirectoryPaths(scopedDescriptors, { siteTitle });
  const savedRows = await imageAssetStore.listSavedImageAssetsByMapAsync(mapId);

  const rowsByNode = new Map();
  (savedRows || []).forEach((row) => {
    const nodeId = String(row.node_id || '').trim();
    const assetField = String(row.asset_field || '').trim();
    if (!validNodeIds.has(nodeId) || !exportableFields.has(assetField)) return;
    if (selectedSet && !selectedSet.has(nodeId)) return;
    if (!rowsByNode.has(nodeId)) rowsByNode.set(nodeId, []);
    rowsByNode.get(nodeId).push(row);
  });

  const files = [];
  const staleNodeIds = new Set();
  const missingEntries = [];
  const usedPaths = new Set();
  const fieldPriority = {
    fullScreenshotUrl: 0,
    thumbnailFullUrl: 1,
  };
  const nodeEntries = Array.from(rowsByNode.entries())
    .map(([nodeId, rows]) => {
      const descriptor = getDescriptor(nodeId);
      return {
        nodeId,
        descriptor,
        sortPath: buildImageDownloadPath({
          descriptor,
          assetField: 'fullScreenshotUrl',
          exportedFieldCount: 1,
          extension: 'jpg',
          usedPaths: new Set(),
          siteTitle,
        }),
        rows: rows.slice().sort((left, right) => (
          (fieldPriority[String(left.asset_field || '').trim()] ?? 99)
          - (fieldPriority[String(right.asset_field || '').trim()] ?? 99)
        )),
      };
    })
    .sort((left, right) => compareImageDownloadPaths(left.sortPath, right.sortPath));

  for (const entry of nodeEntries) {
    const node = currentNodesById.get(entry.nodeId);
    const currentUrl = entry.descriptor.url || node?.url || '';
    for (const row of entry.rows) {
      const nodeId = entry.nodeId;
      const assetField = String(row.asset_field || '').trim();
      const storageKey = String(row.storage_key || '').trim() || extractScreenshotStorageKey(row.url);
      if (!storageKey) continue;

      const metadata = await readScreenshotJson(`${storageKey}.json`);
      if (metadata?.url && currentUrl && !urlsMatch(metadata.url, currentUrl)) {
        staleNodeIds.add(nodeId);
        break;
      }

      const object = await readScreenshotObject(storageKey);
      if (!object?.buffer || Number(object.size || object.buffer.length || 0) <= 0) {
        missingEntries.push({
          mapId,
          nodeId,
          assetField,
          assetType: row.asset_type || assetField,
          storageKey,
          url: row.url || null,
          provider: row.provider || getScreenshotStorageProvider(),
          contentType: row.content_type || getContentTypeForKey(storageKey),
          status: 'missing',
          error: 'Missing saved asset',
        });
        continue;
      }

      const extension = getAssetExtension({
        storageKey,
        contentType: row.content_type || object.contentType,
      });
      const filePath = buildImageDownloadPath({
        descriptor: entry.descriptor,
        assetField,
        exportedFieldCount: 1,
        extension,
        usedPaths,
        siteTitle,
      });

      files.push({
        path: filePath,
        buffer: object.buffer,
        contentType: row.content_type || object.contentType || getContentTypeForKey(storageKey),
        nodeId,
        assetField,
      });
      break;
    }
  }

  if (missingEntries.length > 0) {
    imageAssetStore.markImageAssetsMissingAsync(missingEntries).catch((error) => {
      console.warn('Image download missing asset mark error:', error.message);
    });
  }
  if (staleNodeIds.size > 0) {
    imageAssetStore.markImageAssetsStaleByNodeIdsAsync({
      mapId,
      nodeIds: Array.from(staleNodeIds),
    }).catch((error) => {
      console.warn('Image download stale asset mark error:', error.message);
    });
  }

  return {
    directories,
    files: sortImageDownloadEntries(files),
    staleNodeIds: Array.from(staleNodeIds),
  };
}

async function upsertManifestForNodeAssetUpdates(mapId, updatesById) {
  const manifestEntries = [];
  for (const [nodeId, assets] of updatesById.entries()) {
    for (const [assetField, value] of Object.entries(assets || {})) {
      if (!NODE_ASSET_IMAGE_URL_FIELDS.has(assetField) || typeof value !== 'string' || !value.trim()) {
        continue;
      }
      const storageKey = extractScreenshotStorageKey(value);
      const stats = storageKey ? await statScreenshotObject(storageKey) : null;
      manifestEntries.push({
        mapId,
        nodeId,
        assetField,
        assetType: getNodeAssetManifestType(assetField, assets),
        storageKey: storageKey || null,
        url: value,
        provider: getScreenshotStorageProvider(),
        sizeBytes: stats?.size || null,
        contentType: storageKey ? getContentTypeForKey(storageKey) : null,
        status: stats && Number(stats.size || 0) > 0 ? 'saved' : 'missing',
        error: stats && Number(stats.size || 0) > 0 ? null : 'Missing saved asset',
        capturedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
      });
    }
  }

  if (manifestEntries.length > 0) {
    await imageAssetStore.upsertImageAssetsAsync(manifestEntries);
  }
}

function normalizeNodeAssetUpdates(rawUpdates) {
  if (!Array.isArray(rawUpdates)) {
    return { error: 'updates must be an array' };
  }
  if (rawUpdates.length > 2000) {
    return { error: 'Too many node asset updates' };
  }

  const updatesById = new Map();
  rawUpdates.forEach((entry) => {
    const nodeId = String(entry?.nodeId || entry?.id || '').trim();
    const rawAssets = entry?.assets || entry?.updates || {};
    if (!nodeId || !rawAssets || typeof rawAssets !== 'object' || Array.isArray(rawAssets)) return;

    const normalized = {};
    Object.entries(rawAssets).forEach(([key, value]) => {
      if (value === undefined) return;
      if (NODE_ASSET_STRING_FIELDS.has(key)) {
        if (value === null) {
          normalized[key] = null;
          return;
        }
        const nextValue = String(value).trim();
        normalized[key] = nextValue || null;
        return;
      }
      if (NODE_ASSET_BOOLEAN_FIELDS.has(key)) {
        normalized[key] = parseBooleanLike(value, false);
      }
    });

    if (Object.keys(normalized).length === 0) return;
    updatesById.set(nodeId, {
      ...(updatesById.get(nodeId) || {}),
      ...normalized,
    });
  });

  return { updatesById };
}

function applyNodeAssetUpdatesToTree(node, updatesById, result) {
  if (!node || typeof node !== 'object') return node;

  let nextNode = node;
  const patch = updatesById.get(String(node.id || ''));
  if (patch) {
    nextNode = { ...node };
    Object.entries(patch).forEach(([key, value]) => {
      if (nextNode[key] !== value) {
        nextNode[key] = value;
        result.changed = true;
      }
    });
    result.updatedNodeIds.add(String(node.id));
  }

  const children = Array.isArray(node.children) ? node.children : null;
  if (children) {
    let childrenChanged = false;
    const nextChildren = children.map((child) => {
      const nextChild = applyNodeAssetUpdatesToTree(child, updatesById, result);
      if (nextChild !== child) childrenChanged = true;
      return nextChild;
    });
    if (childrenChanged) {
      if (nextNode === node) nextNode = { ...node };
      nextNode.children = nextChildren;
      result.changed = true;
    }
  }

  return nextNode;
}

function applyNodeAssetUpdatesToMapData({ root, orphans, updatesById }) {
  const result = { changed: false, updatedNodeIds: new Set() };
  const nextRoot = applyNodeAssetUpdatesToTree(root, updatesById, result);
  const nextOrphans = Array.isArray(orphans)
    ? orphans.map((orphan) => applyNodeAssetUpdatesToTree(orphan, updatesById, result))
    : orphans;
  return {
    root: nextRoot,
    orphans: nextOrphans,
    changed: result.changed,
    updatedNodeIds: Array.from(result.updatedNodeIds),
  };
}

function parseMapVersionFields(row) {
  const parseOptional = (raw, fieldName, fallback) => {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`Skipping invalid map version field ${fieldName}:`, {
        versionId: row?.id || null,
        mapId: row?.map_id || null,
        error: error.message,
      });
      return fallback;
    }
  };

  const root = parseOptional(row?.root_data, 'root_data', null);
  if (!root || typeof root !== 'object') {
    console.warn('Skipping map version with missing root data:', {
      versionId: row?.id || null,
      mapId: row?.map_id || null,
    });
    return null;
  }

  return {
    root,
    orphans: parseOptional(row.orphans_data, 'orphans_data', []),
    connections: parseOptional(row.connections_data, 'connections_data', []),
    colors: parseOptional(row.colors, 'colors', null),
    connectionColors: parseOptional(row.connection_colors, 'connection_colors', null),
    root_data: undefined,
    orphans_data: undefined,
    connections_data: undefined,
    connection_colors: undefined,
  };
}

function serializeMapVersion(row) {
  const fields = parseMapVersionFields(row);
  if (!fields) return null;
  const isBookmarked = Boolean(Number(row.is_bookmarked || 0));

  return {
    ...row,
    ...fields,
    isBookmarked,
    bookmarkedAt: row.bookmarked_at || null,
    createdBy: row.user_id ? {
      userId: row.user_id,
      name: row.created_by_name || null,
      email: row.created_by_email || null,
    } : null,
    bookmarkedBy: row.bookmarked_by_user_id ? {
      userId: row.bookmarked_by_user_id,
      name: row.bookmarked_by_name || null,
      email: row.bookmarked_by_email || null,
    } : null,
    created_by_name: undefined,
    created_by_email: undefined,
    bookmarked_by_name: undefined,
    bookmarked_by_email: undefined,
  };
}

function parseJsonArray(raw, fallback = []) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function ensureMapNameAvailable({
  res,
  ownerId,
  projectId,
  name,
  excludeMapId = null,
}) {
  const trimmedName = String(name || '').trim();
  const conflict = await mapStore.getMapNameConflictAsync({
    ownerId,
    projectId,
    name: trimmedName,
    excludeMapId,
  });
  if (!conflict) return true;
  res.status(409).json({
    error: `A map named "${trimmedName}" already exists in this folder.`,
    code: 'MAP_NAME_CONFLICT',
    conflict: {
      map_id: conflict.id,
      name: conflict.name,
      project_id: conflict.project_id || null,
    },
  });
  return false;
}

function serializeMapComment(row) {
  return {
    id: row.id,
    mapId: row.map_id,
    nodeId: row.node_id,
    parentCommentId: row.parent_comment_id || null,
    author: row.author_name || row.author_email || 'Anonymous',
    authorUserId: row.author_user_id || null,
    authorEmail: row.author_email || null,
    text: row.text,
    mentions: parseJsonArray(row.mentions, []),
    completed: !!row.completed,
    completedBy: row.completed_by_name || null,
    completedByUserId: row.completed_by_user_id || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replies: [],
  };
}

function buildCommentsByNode(rows) {
  const serialized = rows.map((row) => serializeMapComment(row));
  const byId = new Map(serialized.map((comment) => [comment.id, comment]));
  const byNode = new Map();

  serialized.forEach((comment) => {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId).replies.push(comment);
      return;
    }

    if (!byNode.has(comment.nodeId)) {
      byNode.set(comment.nodeId, []);
    }
    byNode.get(comment.nodeId).push(comment);
  });

  return Object.fromEntries(byNode.entries());
}

function collectNodeIds(node, out = new Set()) {
  if (!node?.id) return out;
  out.add(node.id);
  (node.children || []).forEach((child) => collectNodeIds(child, out));
  return out;
}

function getMapNodeIdSet(mapRow) {
  const parsed = parseMapFields(mapRow);
  const nodeIds = new Set();
  if (parsed.root) collectNodeIds(parsed.root, nodeIds);
  (parsed.orphans || []).forEach((orphan) => collectNodeIds(orphan, nodeIds));
  return nodeIds;
}

function normalizeIsoTimestamp(raw, fallback = null) {
  const value = String(raw || '').trim();
  if (!value) return fallback;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fallback;
  return new Date(timestamp).toISOString();
}

function collectLegacyCommentsFromNode(node, mapId, out = []) {
  if (!node?.id) return out;

  const walkComment = (comment, parentCommentId = null) => {
    if (!comment || typeof comment !== 'object') return;
    const commentId = String(comment.id || '').trim() || uuidv4();
    out.push({
      id: commentId,
      mapId,
      nodeId: node.id,
      parentCommentId,
      authorName: String(comment.author || '').trim() || 'Anonymous',
      authorEmail: null,
      text: String(comment.text || '').trim(),
      mentions: Array.isArray(comment.mentions) ? comment.mentions : [],
      completed: !!comment.completed,
      completedByName: comment.completed ? (String(comment.completedBy || '').trim() || null) : null,
      completedAt: comment.completed ? normalizeIsoTimestamp(comment.completedAt, null) : null,
      createdAt: normalizeIsoTimestamp(comment.createdAt, new Date().toISOString()),
      updatedAt: normalizeIsoTimestamp(comment.completedAt || comment.createdAt, new Date().toISOString()),
    });
    (comment.replies || []).forEach((reply) => walkComment(reply, commentId));
  };

  (node.comments || []).forEach((comment) => walkComment(comment));
  (node.children || []).forEach((child) => collectLegacyCommentsFromNode(child, mapId, out));
  return out;
}

async function ensureLegacyMapCommentsImportedAsync(mapRow) {
  const existingCount = await mapCommentStore.countCommentsByMapAsync(mapRow.id);
  if (existingCount > 0) return;

  let parsed;
  try {
    parsed = parseMapFields(mapRow);
  } catch {
    return;
  }

  const legacyComments = [];
  if (parsed.root) {
    collectLegacyCommentsFromNode(parsed.root, mapRow.id, legacyComments);
  }
  (parsed.orphans || []).forEach((orphan) => collectLegacyCommentsFromNode(orphan, mapRow.id, legacyComments));

  const validComments = legacyComments.filter((comment) => comment.text);
  if (validComments.length === 0) return;

  await mapCommentStore.importLegacyCommentsAsync({
    mapId: mapRow.id,
    comments: validComments,
  });
}

async function getCommentAccessibleMapAsync(mapId, userId, collaborationEnabled) {
  return collaborationEnabled
    ? mapStore.getMapAccessibleToUserAsync(mapId, userId)
    : mapStore.getMapForUserAsync(mapId, userId);
}

function denyResource(res, { status = 404, error = 'Resource not found' } = {}) {
  res.status(status).json({ error });
  return false;
}

function ensureResourceAction({
  req,
  res,
  resource,
  action,
  failureStatus = 404,
  failureError = 'Resource not found',
}) {
  if (!resource) {
    return denyResource(res, { status: failureStatus, error: failureError });
  }

  const role = permissionPolicy.resolveResourceRole({
    actorUserId: req.user?.id || null,
    resourceOwnerUserId: resource.user_id || null,
    membershipRole: resource.membership_role || resource.membershipRole || null,
  });

  if (!permissionPolicy.can(action, role)) {
    return denyResource(res, { status: failureStatus, error: failureError });
  }

  return true;
}

async function ensureCollaborationSchemaIfEnabledAsync() {
  if (!COLLABORATION_BACKEND_ENABLED) return false;
  await Promise.all([
    collaborationStore.ensureCollaborationSchemaAsync(),
    ensureCollaborationActivitySchemaAsync(),
  ]);
  return true;
}

function buildFeatureGatePayload(role, { coediting = null, collaboration = null } = {}) {
  const features = {};
  for (const [key, feature] of Object.entries(FEATURE_GATES)) {
    features[key] = permissionPolicy.isFeatureAllowed(feature, role);
  }
  if (coediting?.features) {
    Object.assign(features, coediting.features);
  }
  return {
    role: permissionPolicy.normalizeRole(role),
    features,
    collaboration: collaboration || getDefaultCollaborationCapabilityPayload(),
    coediting: coediting
      ? {
        mode: coediting.mode,
        reason: coediting.reason,
        reasons: coediting.reasons,
        readOnlyFallbackActive: !!coediting.health?.readOnlyFallbackActive,
        healthStatus: coediting.health?.status || 'healthy',
      }
      : {
        mode: 'disabled',
        reason: 'unavailable',
        reasons: ['unavailable'],
        readOnlyFallbackActive: false,
        healthStatus: 'healthy',
      },
  };
}

function getDefaultCollaborationCapabilityPayload() {
  return {
    accessPolicy: 'private',
    accessRequestsEnabled: false,
    nonViewerInvitesRequireOwner: true,
    canSendInvites: false,
    inviteRoles: [],
    canRequestAccess: false,
    hasOtherWritableCollaborators: false,
    otherWritableCollaboratorCount: 0,
  };
}

function normalizeIdKey(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeProjectSelectionValue(value) {
  const normalized = normalizeIdKey(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === 'uncategorized' || normalized === 'shared-with-me' || normalized === 'shared') {
    return null;
  }
  return String(value).trim();
}

function resolveInviteRolesForActor(role, settings = {}) {
  const normalizedRole = permissionPolicy.normalizeRole(role);
  const accessPolicy = String(settings.access_policy || settings.accessPolicy || 'private')
    .trim()
    .toLowerCase();
  const requireOwnerForNonViewer = !!(
    settings.non_viewer_invites_require_owner
    ?? settings.nonViewerInvitesRequireOwner
  );

  if (normalizedRole === permissionPolicy.ROLES.OWNER) {
    return ['viewer', 'commenter', 'editor', 'owner'];
  }

  if (normalizedRole === permissionPolicy.ROLES.EDITOR) {
    return requireOwnerForNonViewer
      ? ['viewer']
      : ['viewer', 'commenter', 'editor'];
  }

  if (
    accessPolicy === 'viewer_invites_open'
    && permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, normalizedRole)
  ) {
    return ['viewer'];
  }

  return [];
}

async function createInitialMapVersionAsync({
  mapId,
  userId,
  notes,
  root,
  orphans,
  connections,
  colors,
  connectionColors,
}) {
  const versionId = uuidv4();
  const versionNumber = await mapStore.getNextMapVersionNumberByMapAsync(mapId);
  const versionName = 'Initial';
  const versionNotes = notes ? String(notes).trim() : null;
  const sanitizedTree = sanitizeMapTreeForStorage({ root, orphans });

  await mapStore.createMapVersionAsync({
    id: versionId,
    mapId,
    userId,
    versionNumber,
    name: versionName,
    notes: versionNotes,
    rootData: JSON.stringify(sanitizedTree.root),
    orphansData: sanitizedTree.orphans ? JSON.stringify(sanitizedTree.orphans) : null,
    connectionsData: connections ? JSON.stringify(connections) : null,
    colors: colors ? JSON.stringify(colors) : null,
    connectionColors: connectionColors ? JSON.stringify(connectionColors) : null,
  });

  return {
    id: versionId,
    versionNumber,
    name: versionName,
    notes: versionNotes,
  };
}

async function ensureInitialMapVersionForMapAsync(mapRow) {
  if (!mapRow?.id) return null;
  const existingVersionIds = await mapStore.listMapVersionIdsByMapAsync(mapRow.id);
  if ((existingVersionIds || []).length > 0) {
    return null;
  }

  const parsed = parseMapFields(mapRow);
  const initialVersion = await createInitialMapVersionAsync({
    mapId: mapRow.id,
    userId: mapRow.user_id,
    notes: mapRow.notes || null,
    root: parsed.root,
    orphans: parsed.orphans,
    connections: parsed.connections,
    colors: parsed.colors,
    connectionColors: parsed.connectionColors,
  });

  await ensureCollaborationActivitySchemaAsync();
  await recordMapActivityBestEffortAsync({
    mapId: mapRow.id,
    actorUserId: mapRow.user_id,
    actorRole: permissionPolicy.ROLES.OWNER,
    eventType: ACTIVITY_TYPES.VERSION_SAVED,
    eventScope: ACTIVITY_SCOPES.VERSION,
    entityType: 'version',
    entityId: initialVersion.id,
    summary: `Saved version ${initialVersion.versionNumber}: ${initialVersion.name}`,
    payload: {
      versionId: initialVersion.id,
      versionNumber: initialVersion.versionNumber,
      name: initialVersion.name,
      notes: initialVersion.notes,
      initial: true,
      repaired: true,
    },
  }, { label: 'initial map version backfill' });

  return initialVersion;
}

async function buildCollaborationCapabilityPayload(
  mapId,
  role,
  {
    actorUserId = null,
    ownerUserId = null,
  } = {},
) {
  if (!COLLABORATION_BACKEND_ENABLED || !mapId) {
    return getDefaultCollaborationCapabilityPayload();
  }

  await ensureCollaborationSchemaIfEnabledAsync();
  const [settings, memberships] = await Promise.all([
    collaborationStore.getCollaborationSettingsByMapAsync(mapId),
    collaborationStore.listMembershipsByMapAsync(mapId),
  ]);
  const inviteRoles = resolveInviteRolesForActor(role, settings);
  const normalizedRole = permissionPolicy.normalizeRole(role);
  const canReadMap = permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, normalizedRole);
  const actorKey = normalizeIdKey(actorUserId);
  const ownerKey = normalizeIdKey(ownerUserId);
  const writerKeys = new Set();

  if (ownerKey) {
    writerKeys.add(ownerKey);
  }

  for (const membership of memberships || []) {
    const membershipRole = permissionPolicy.normalizeRole(membership?.role);
    if (
      membershipRole !== permissionPolicy.ROLES.OWNER
      && membershipRole !== permissionPolicy.ROLES.EDITOR
    ) {
      continue;
    }
    const userKey = normalizeIdKey(membership?.user_id);
    if (userKey) {
      writerKeys.add(userKey);
    }
  }

  const otherWritableCollaboratorCount = Array.from(writerKeys).filter(
    (userKey) => userKey && userKey !== actorKey
  ).length;

  return {
    accessPolicy: String(settings?.access_policy || 'private').trim().toLowerCase() || 'private',
    accessRequestsEnabled: !!settings?.access_requests_enabled,
    nonViewerInvitesRequireOwner: !!settings?.non_viewer_invites_require_owner,
    canSendInvites: inviteRoles.length > 0,
    inviteRoles,
    canRequestAccess: !!settings?.access_requests_enabled
      && !canReadMap
      && permissionPolicy.can(permissionPolicy.ACTIONS.ACCESS_REQUEST_CREATE, normalizedRole),
    hasOtherWritableCollaborators: otherWritableCollaboratorCount > 0,
    otherWritableCollaboratorCount,
  };
}

async function resolveMembershipRoleAsync(mapId, userId) {
  if (!COLLABORATION_BACKEND_ENABLED || !mapId || !userId) return null;
  try {
    await ensureCollaborationSchemaIfEnabledAsync();
    const membership = await collaborationStore.getMembershipByMapAndUserAsync(mapId, userId);
    return membership?.role || null;
  } catch (error) {
    console.error('Resolve membership role error:', error);
    return null;
  }
}

async function resolveMapPermissionContextAsync({ mapId, actorUserId }) {
  const map = await mapStore.getMapByIdAsync(mapId);
  if (!map) return { map: null, role: permissionPolicy.ROLES.NONE };
  const membershipRole = await resolveMembershipRoleAsync(mapId, actorUserId);
  const role = permissionPolicy.resolveResourceRole({
    actorUserId,
    resourceOwnerUserId: map.user_id,
    membershipRole,
  });
  return { map, role };
}

// Apply auth middleware to all routes
router.use(authMiddleware);

// POST /api/feedback - capture authenticated in-app feedback
router.post('/feedback', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const message = String(body.message || '').trim();
    const intent = String(body.intent || '').trim();
    const scope = String(body.scope || '').trim();
    const surface = String(body.surface || '').trim();

    if (!message) {
      return res.status(400).json({ error: 'Feedback message is required.' });
    }
    if (!feedbackStore.ITEM_INTENTS.has(intent)) {
      return res.status(400).json({ error: 'Invalid feedback intent.' });
    }
    if (!feedbackStore.ITEM_SCOPES.has(scope)) {
      return res.status(400).json({ error: 'Invalid feedback scope.' });
    }
    if (!surface) {
      return res.status(400).json({ error: 'Feedback surface is required.' });
    }
    if (message.length > FEEDBACK_MESSAGE_MAX_LENGTH) {
      return res.status(400).json({ error: `Feedback message must be ${FEEDBACK_MESSAGE_MAX_LENGTH} characters or less.` });
    }

    await feedbackStore.ensureFeedbackSchemaAsync();

    const feedbackId = uuidv4();
    const screenshotDataUrl = typeof body.screenshot_data_url === 'string'
      ? body.screenshot_data_url
      : (typeof body.screenshotDataUrl === 'string' ? body.screenshotDataUrl : '');
    const screenshotPath = screenshotDataUrl.trim()
      ? await saveFeedbackImageFromDataUrl({
        feedbackId,
        imageDataUrl: screenshotDataUrl,
      })
      : null;

    const created = await feedbackStore.createFeedbackItemAsync({
      id: feedbackId,
      actorUserId: req.user?.id || null,
      actorName: req.user?.name || 'Anonymous',
      actorEmail: req.user?.email || null,
      surface,
      routePath: body.route_path || body.routePath || null,
      routeSection: body.route_section || body.routeSection || null,
      mapId: body.map_id || body.mapId || null,
      shareId: body.share_id || body.shareId || null,
      scope,
      intent,
      rating: body.rating,
      message,
      componentKey: body.component_key || body.componentKey || null,
      componentLabel: body.component_label || body.componentLabel || null,
      domHint: body.dom_hint || body.domHint || null,
      screenshotPath,
      allowFollowUp: parseBooleanLike(body.allow_follow_up ?? body.allowFollowUp, false),
      context: body.context || null,
    });

    const refreshed = await feedbackStore.getFeedbackItemByIdAsync(created.id);
    return res.status(201).json({
      feedback: serializeFeedbackItem(refreshed),
    });
  } catch (error) {
    console.error('Create feedback error:', error);
    return res.status(error?.status || 500).json({ error: error?.message || 'Failed to submit feedback.' });
  }
});

// ============================================
// ADMIN / USAGE
// ============================================

// GET /api/admin/usage - Aggregated usage metrics
router.get('/admin/usage', requireAdminKey, async (req, res) => {
  try {
    const daysRaw = Number.parseInt(req.query?.days, 10);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;
    const since = `-${days} days`;

    const byDay = await usageStore.getUsageByDaySinceAsync(since);
    const totals = await usageStore.getUsageTotalsSinceAsync(since);

    res.json({ days, totals, byDay });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ error: 'Failed to get usage' });
  }
});

// GET /api/admin/coediting - rollout + health summary for operational checks
router.get('/admin/coediting', requireAdminKey, async (_req, res) => {
  try {
    const health = await getCoeditingHealthSnapshotAsync();
    const status = await resolveCoeditingSystemStatusAsync({ healthSnapshot: health });
    res.json({
      ok: true,
      status: status.status,
      reason: status.reason,
      reasons: status.reasons,
      rollout: await summarizeCoeditingRolloutConfigAsync(process.env, {
        includeConfigErrors: true,
        includeSensitive: true,
      }),
      health,
    });
  } catch (error) {
    console.error('Get admin coediting health error:', error);
    res.status(500).json({ error: 'Failed to resolve coediting health' });
  }
});

// GET /api/admin/email-deliveries/summary - email health + recent aggregate delivery stats
router.get('/admin/email-deliveries/summary', requireAdminKey, async (req, res) => {
  try {
    const days = parseWindowDays(req.query?.days, 30, 365);
    const summary = await emailDeliveryStore.summarizeEmailDeliveriesAsync({
      days,
      recentFailureLimit: 10,
    });

    res.json({
      ok: true,
      days,
      health: getEmailHealthSnapshot(),
      summary: {
        ...summary,
        recentFailures: (summary.recentFailures || []).map((row) => serializeEmailDeliveryAdmin(row)),
      },
    });
  } catch (error) {
    console.error('Get admin email delivery summary error:', error);
    res.status(500).json({ error: 'Failed to summarize email deliveries' });
  }
});

// GET /api/admin/email-deliveries - list recent email delivery rows with filters
router.get('/admin/email-deliveries', requireAdminKey, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query, {
      defaultLimit: 50,
      maxLimit: 200,
    });

    const filters = {
      status: req.query?.status || null,
      provider: req.query?.provider || null,
      templateKey: req.query?.template_key || req.query?.templateKey || null,
      toEmail: req.query?.to_email || req.query?.toEmail || null,
      jobId: req.query?.job_id || req.query?.jobId || null,
      mapId: req.query?.map_id || req.query?.mapId || null,
      inviteId: req.query?.invite_id || req.query?.inviteId || null,
      providerMessageId: req.query?.provider_message_id || req.query?.providerMessageId || null,
    };

    const [deliveries, total] = await Promise.all([
      emailDeliveryStore.listEmailDeliveriesAsync(filters, { limit, offset }),
      emailDeliveryStore.countEmailDeliveriesAsync(filters),
    ]);

    res.json({
      filters,
      pagination: { limit, offset, total },
      deliveries: deliveries.map((row) => serializeEmailDeliveryAdmin(row)),
    });
  } catch (error) {
    console.error('List admin email deliveries error:', error);
    res.status(500).json({ error: 'Failed to list email deliveries' });
  }
});

// GET /api/admin/email-deliveries/:deliveryId - inspect a single delivery row
router.get('/admin/email-deliveries/:deliveryId', requireAdminKey, async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const [delivery, events] = await Promise.all([
      emailDeliveryStore.getEmailDeliveryByIdAsync(deliveryId),
      emailDeliveryStore.listEmailDeliveryEventsByDeliveryAsync(deliveryId, {
        limit: 100,
        offset: 0,
      }),
    ]);
    if (!delivery) {
      return res.status(404).json({ error: 'Email delivery not found' });
    }

    return res.json({
      delivery: serializeEmailDeliveryAdmin(delivery, { includeDebug: true }),
      events: events.map((event) => serializeEmailDeliveryEventAdmin(event)),
    });
  } catch (error) {
    console.error('Get admin email delivery detail error:', error);
    res.status(500).json({ error: 'Failed to get email delivery detail' });
  }
});

// ============================================
// PROJECTS
// ============================================

// GET /api/projects - Get all projects for current user
router.get('/projects', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const projects = await projectStore.listProjectsByUserAsync(req.user.id, { limit, offset });
    const total = await projectStore.countProjectsByUserAsync(req.user.id);

    res.json({ projects, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

// POST /api/projects - Create a new project
router.post('/projects', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const projectId = uuidv4();

    await projectStore.createProjectAsync({
      id: projectId,
      userId: req.user.id,
      name: name.trim(),
    });
    const project = await projectStore.getProjectByIdAsync(projectId);

    res.json({ project: { ...project, map_count: 0 } });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id - Update a project
router.put('/projects/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Verify ownership
    const project = await projectStore.getProjectForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: project,
      action: permissionPolicy.ACTIONS.PROJECT_UPDATE,
      failureError: 'Project not found',
    })) return;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    await projectStore.updateProjectNameAsync(id, name.trim());

    const updated = await projectStore.getProjectByIdAsync(id);
    const mapCount = await projectStore.countMapsByProjectAsync(id);

    res.json({ project: { ...updated, map_count: mapCount } });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id - Delete a project
router.delete('/projects/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const project = await projectStore.getProjectForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: project,
      action: permissionPolicy.ACTIONS.PROJECT_DELETE,
      failureError: 'Project not found',
    })) return;

    // Delete project (maps will have project_id set to NULL due to ON DELETE SET NULL)
    await projectStore.deleteProjectAsync(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ============================================
// MAPS
// ============================================

// GET /api/maps - Get all maps for current user (optionally filtered by project)
router.get('/maps', requireAuth, async (req, res) => {
  try {
    const { project_id } = req.query;
    const { limit, offset } = parsePagination(req.query);
    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();

    const maps = collaborationEnabled
      ? await mapStore.listMapsAccessibleToUserAsync({
        userId: req.user.id,
        projectId: project_id || null,
        limit,
        offset,
      })
      : await mapStore.listMapsByUserAsync({
        userId: req.user.id,
        projectId: project_id || null,
        limit,
        offset,
      });
    const total = collaborationEnabled
      ? await mapStore.countMapsAccessibleToUserAsync({
        userId: req.user.id,
        projectId: project_id || null,
      })
      : await mapStore.countMapsByUserAsync({
        userId: req.user.id,
        projectId: project_id || null,
      });

    // Parse JSON fields
    const parsed = maps.map(m => ({
      ...m,
      ...parseMapFields(m),
    }));

    res.json({ maps: parsed, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('Get maps error:', error);
    res.status(500).json({ error: 'Failed to get maps' });
  }
});

// GET /api/maps/:id - Get a specific map
router.get('/maps/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapWithProjectAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapWithProjectForUserAsync(id, req.user.id);

    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_READ,
      failureError: 'Map not found',
    })) return;

    const repaired = await repairMapImageAssetsFromManifest(map, { persist: true });
    res.json({
      map: {
        ...repaired.row,
        ...repaired.parsed,
      },
    });
  } catch (error) {
    console.error('Get map error:', error);
    res.status(500).json({ error: 'Failed to get map' });
  }
});

// POST /api/maps/:id/images/download - Download current map images as one file or a zip
router.post('/maps/:id/images/download', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const scope = req.body?.scope === 'selected' ? 'selected' : 'all';
    const selectedNodeIds = normalizeSelectedNodeIds(req.body?.selectedNodeIds || req.body?.nodeIds);
    if (scope === 'selected' && selectedNodeIds.length === 0) {
      return res.status(400).json({ error: 'No selected pages provided' });
    }
    if (selectedNodeIds.length > 2000) {
      return res.status(400).json({ error: 'Too many selected pages' });
    }

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);

    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_READ,
      failureError: 'Map not found',
    })) return;

    const repaired = await repairMapImageAssetsFromManifest(map, { persist: true });
    const { directories, files, staleNodeIds } = await buildMapImageDownloadFiles({
      mapId: id,
      parsedMap: repaired.parsed,
      scope,
      selectedNodeIds,
      clientNodes: req.body?.nodes,
    });

    if (files.length === 0) {
      return res.status(404).json({
        error: staleNodeIds.length > 0
          ? 'No current saved images to download. Recapture images for pages whose URL changed.'
          : 'No saved images to download',
        staleNodeIds,
      });
    }

    const packageName = buildImageDownloadPackageName(map.name || repaired.parsed.root?.title || 'Map');
    if (files.length === 1) {
      const file = files[0];
      const filename = file.path.split('/').pop() || `${packageName}.jpg`;
      res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', buildContentDisposition(filename));
      res.setHeader('Content-Length', file.buffer.length);
      return res.send(file.buffer);
    }

    const zipEntries = orderImageDownloadZipEntries([
      { path: `${packageName}/`, buffer: Buffer.alloc(0), directory: true },
      ...(directories || []).map((directoryPath) => ({
        path: `${packageName}/${directoryPath}/`,
        buffer: Buffer.alloc(0),
        directory: true,
      })),
      ...files.map((file) => ({
        ...file,
        path: `${packageName}/${file.path}`,
      })),
    ]);
    const zipBuffer = createZipBuffer(zipEntries);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', buildContentDisposition(`${packageName}.zip`));
    res.setHeader('Content-Length', zipBuffer.length);
    return res.send(zipBuffer);
  } catch (error) {
    console.error('Download map images error:', error);
    return res.status(500).json({ error: 'Failed to download map images' });
  }
});

// GET /api/maps/:id/feature-gates - resolve role + feature access for current actor
router.get('/maps/:id/feature-gates', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { map, role } = await resolveMapPermissionContextAsync({
      mapId: id,
      actorUserId: req.user.id,
    });

    if (!map || !permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, role)) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const [coediting, collaboration] = await Promise.all([
      resolveCoeditingRolloutAsync({
        mapId: id,
        actorId: req.user.id,
        role,
      }),
      buildCollaborationCapabilityPayload(id, role, {
        actorUserId: req.user.id,
        ownerUserId: map.user_id,
      }),
    ]);

    res.json({
      permissions: buildFeatureGatePayload(role, { coediting, collaboration }),
    });
  } catch (error) {
    console.error('Get map feature gates error:', error);
    res.status(500).json({ error: 'Failed to resolve map permissions' });
  }
});

// GET /api/maps/:id/insights - Get saved insights for a saved map
router.get('/maps/:id/insights', requireAuth, async (req, res) => {
  try {
    await mapStore.ensureMapInsightsSchemaAsync();
    const { id } = req.params;
    const { map, role } = await resolveMapPermissionContextAsync({
      mapId: id,
      actorUserId: req.user.id,
    });

    if (!map || !permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, role)) {
      return res.status(404).json({ error: 'Map not found' });
    }

    res.json({
      insights: safeParse(map.insights_data, 'insights_data', null),
      insights_generated_at: map.insights_generated_at || null,
    });
  } catch (error) {
    console.error('Get map insights error:', error);
    res.status(500).json({ error: 'Failed to get map insights' });
  }
});

// POST /api/maps - Save a new map
router.post('/maps', requireAuth, async (req, res) => {
  try {
    const { name, url, root, orphans, connections, colors, connectionColors, project_id, notes } = req.body;
    const normalizedProjectId = normalizeProjectSelectionValue(project_id);
    const trimmedName = String(name || '').trim();

    if (!trimmedName) {
      return res.status(400).json({ error: 'Map name is required' });
    }

    if (!root) {
      return res.status(400).json({ error: 'Map data is required' });
    }

    // If project_id provided, verify ownership
    if (normalizedProjectId) {
      const project = await projectStore.getProjectForUserAsync(normalizedProjectId, req.user.id);
      if (!ensureResourceAction({
        req,
        res,
        resource: project,
        action: permissionPolicy.ACTIONS.MAP_CREATE,
        failureStatus: 400,
        failureError: 'Project not found',
      })) return;
    }

    if (!await ensureMapNameAvailable({
      res,
      ownerId: req.user.id,
      projectId: normalizedProjectId,
      name: trimmedName,
    })) return;

    const mapId = uuidv4();
    const sanitizedTree = sanitizeMapTreeForStorage({ root, orphans });

    await mapStore.createMapAsync({
      id: mapId,
      userId: req.user.id,
      projectId: normalizedProjectId,
      name: trimmedName,
      notes: notes ? notes.trim() : null,
      url: url || sanitizedTree.root?.url || '',
      rootData: JSON.stringify(sanitizedTree.root),
      orphansData: sanitizedTree.orphans ? JSON.stringify(sanitizedTree.orphans) : null,
      connectionsData: connections ? JSON.stringify(connections) : null,
      colors: colors ? JSON.stringify(colors) : null,
      connectionColors: connectionColors ? JSON.stringify(connectionColors) : null,
    });

    const map = await mapStore.getMapByIdAsync(mapId);
    const initialVersion = await ensureInitialMapVersionForMapAsync(map);
    const refreshedMap = await mapStore.getMapByIdAsync(mapId);
    const savedInitialVersion = initialVersion
      ? await mapStore.getMapVersionByIdAsync(initialVersion.id)
      : null;

    res.json({
      map: {
        ...refreshedMap,
        ...parseMapFields(refreshedMap),
      },
      initialVersion: savedInitialVersion
        ? {
          ...savedInitialVersion,
          ...parseMapFields(savedInitialVersion),
        }
        : null,
    });
  } catch (error) {
    console.error('Create map error:', error);
    res.status(500).json({ error: 'Failed to save map' });
  }
});

// PUT /api/maps/:id - Update a map
router.put('/maps/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      root,
      orphans,
      connections,
      colors,
      connectionColors,
      project_id,
      notes,
      expected_updated_at,
    } = req.body;
    const normalizedProjectId = normalizeProjectSelectionValue(project_id);

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_UPDATE,
      failureError: 'Map not found',
    })) return;

    if (expected_updated_at !== undefined && expected_updated_at !== null && expected_updated_at !== '') {
      const expectedMs = Date.parse(expected_updated_at);
      if (!Number.isFinite(expectedMs)) {
        return res.status(400).json({ error: 'Invalid expected_updated_at value' });
      }

      const actualMs = Date.parse(map.updated_at);
      if (Number.isFinite(actualMs) && actualMs !== expectedMs) {
        return res.status(409).json({
          error: 'Map has changed since your last load',
          code: 'MAP_UPDATE_CONFLICT',
          conflict: {
            expected_updated_at: new Date(expectedMs).toISOString(),
            actual_updated_at: new Date(actualMs).toISOString(),
          },
          latest: {
            id: map.id,
            name: map.name,
            project_id: map.project_id,
            updated_at: map.updated_at,
          },
        });
      }
    }

    const patch = {};
    const nextName = name !== undefined ? String(name || '').trim() : map.name;
    if (name !== undefined && !nextName) {
      return res.status(400).json({ error: 'Map name is required' });
    }
    const nextProjectId = project_id !== undefined ? normalizedProjectId : (map.project_id || null);

    if (name !== undefined || project_id !== undefined) {
      if (!await ensureMapNameAvailable({
        res,
        ownerId: map.user_id,
        projectId: nextProjectId,
        name: nextName,
        excludeMapId: id,
      })) return;
    }

    if (name !== undefined) {
      patch.name = nextName;
    }
    if (notes !== undefined) {
      patch.notes = notes ? notes.trim() : null;
    }
    let treeRoot = root;
    let treeOrphans = orphans;
    let staleImageNodeIds = [];
    if (root !== undefined || orphans !== undefined) {
      let currentRoot = safeParse(map.root_data, 'root_data', null);
      let currentOrphans = safeParse(map.orphans_data, 'orphans_data', []);
      const manifestUpdatesById = await getVerifiedManifestAssetUpdatesById(id);
      if (manifestUpdatesById.size > 0) {
        const repairedCurrent = applyNodeAssetUpdatesToMapData({
          root: currentRoot,
          orphans: currentOrphans,
          updatesById: manifestUpdatesById,
        });
        currentRoot = repairedCurrent.root;
        currentOrphans = repairedCurrent.orphans;
      }
      const preservedTree = preserveExistingImageAssets({
        root,
        orphans,
        currentRoot,
        currentOrphans,
      });
      treeRoot = preservedTree.root;
      treeOrphans = preservedTree.orphans;
      staleImageNodeIds = preservedTree.staleNodeIds || [];
    }

    const sanitizedTree = sanitizeMapTreeForStorage({ root: treeRoot, orphans: treeOrphans });
    if (root !== undefined) {
      patch.rootData = JSON.stringify(sanitizedTree.root);
    }
    if (orphans !== undefined) {
      patch.orphansData = sanitizedTree.orphans ? JSON.stringify(sanitizedTree.orphans) : null;
    }
    if (connections !== undefined) {
      patch.connectionsData = connections ? JSON.stringify(connections) : null;
    }
    if (colors !== undefined) {
      patch.colors = colors ? JSON.stringify(colors) : null;
    }
    if (connectionColors !== undefined) {
      patch.connectionColors = connectionColors ? JSON.stringify(connectionColors) : null;
    }
    if (project_id !== undefined) {
      // Verify project ownership if setting a project
      if (normalizedProjectId) {
        const project = await projectStore.getProjectForUserAsync(normalizedProjectId, req.user.id);
        if (!ensureResourceAction({
          req,
          res,
          resource: project,
          action: permissionPolicy.ACTIONS.MAP_UPDATE,
          failureStatus: 400,
          failureError: 'Project not found',
        })) return;
      }
      patch.projectId = normalizedProjectId;
    }

    await mapStore.updateMapByIdAsync(id, patch);
    if (staleImageNodeIds.length > 0) {
      try {
        await imageAssetStore.markImageAssetsStaleByNodeIdsAsync({
          mapId: id,
          nodeIds: staleImageNodeIds,
        });
      } catch (error) {
        console.warn('Image asset stale mark error:', error.message);
      }
    }

    const updated = await mapStore.getMapByIdAsync(id);

    res.json({
      map: {
        ...updated,
        ...parseMapFields(updated),
      },
    });
  } catch (error) {
    console.error('Update map error:', error);
    res.status(500).json({ error: 'Failed to update map' });
  }
});

// POST /api/maps/:id/node-assets/upload - Store an inline node image as a durable asset URL
router.post('/maps/:id/node-assets/upload', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const nodeId = String(req.body?.nodeId || '').trim();
    const parsedImage = parseNodeAssetDataImage(req.body?.imageDataUrl);

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_UPDATE,
      failureError: 'Map not found',
    })) return;

    if (nodeId) {
      const currentRoot = safeParse(map.root_data, 'root_data', null);
      const currentOrphans = safeParse(map.orphans_data, 'orphans_data', []);
      const currentNodesById = collectNodesById(currentRoot, currentOrphans);
      if (!currentNodesById.has(nodeId)) {
        return res.status(404).json({ error: 'Node not found' });
      }
    }

    const filename = [
      'node',
      String(id).replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 24) || 'map',
      String(nodeId).replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 32) || 'node',
      Date.now(),
      uuidv4().replace(/-/g, '').slice(0, 12),
    ].join('_') + `.${parsedImage.extension}`;
    const assetUrl = await saveScreenshotObject({
      key: filename,
      buffer: parsedImage.buffer,
      contentType: parsedImage.contentType,
      baseUrl: getNodeAssetUploadBaseUrl(req),
    });
    return res.json({
      assetUrl,
      updatedNodeIds: nodeId ? [nodeId] : [],
    });
  } catch (error) {
    console.error('Upload map node asset error:', error);
    return res.status(error?.status || 500).json({ error: error?.message || 'Failed to upload node image' });
  }
});

// PATCH /api/maps/:id/node-assets - Persist screenshot/thumbnail fields without full map autosave
router.patch('/maps/:id/node-assets', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { error, updatesById } = normalizeNodeAssetUpdates(req.body?.updates);
    if (error) {
      return res.status(400).json({ error });
    }
    if (!updatesById || updatesById.size === 0) {
      return res.status(400).json({ error: 'No node asset updates provided' });
    }

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_UPDATE,
      failureError: 'Map not found',
    })) return;

    const currentRoot = safeParse(map.root_data, 'root_data', null);
    const currentOrphans = safeParse(map.orphans_data, 'orphans_data', []);
    const nextMap = applyNodeAssetUpdatesToMapData({
      root: currentRoot,
      orphans: currentOrphans,
      updatesById,
    });

    if (!nextMap.changed) {
      return res.json({
        map: {
          ...map,
          ...parseMapFields(map),
        },
        updatedNodeIds: [],
      });
    }

    const sanitizedTree = sanitizeMapTreeForStorage({
      root: nextMap.root,
      orphans: nextMap.orphans,
    });
    await mapStore.updateMapByIdAsync(id, {
      rootData: JSON.stringify(sanitizedTree.root),
      orphansData: sanitizedTree.orphans ? JSON.stringify(sanitizedTree.orphans) : null,
    });
    await upsertManifestForNodeAssetUpdates(id, updatesById);

    const updated = await mapStore.getMapByIdAsync(id);
    return res.json({
      map: {
        ...updated,
        ...parseMapFields(updated),
      },
      updatedNodeIds: nextMap.updatedNodeIds,
    });
  } catch (error) {
    console.error('Update map node assets error:', error);
    return res.status(500).json({ error: 'Failed to update map node assets' });
  }
});

// DELETE /api/maps/:id - Delete a map
router.delete('/maps/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_DELETE,
      failureError: 'Map not found',
    })) return;

    await mapStore.deleteMapByIdAsync(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete map error:', error);
    res.status(500).json({ error: 'Failed to delete map' });
  }
});

// GET /api/maps/:id/versions - Get version history for a map
router.get('/maps/:id/versions', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_VERSION_LIST,
      failureError: 'Map not found',
    })) return;

    try {
      await ensureInitialMapVersionForMapAsync(map);
    } catch (error) {
      console.warn('Initial map version backfill skipped:', {
        mapId: id,
        error: error.message,
      });
    }

    const versions = collaborationEnabled
      ? await mapStore.listMapVersionsByMapAsync(id, 25)
      : await mapStore.listMapVersionsForUserMapAsync(id, req.user.id, 25);

    const parsed = versions
      .map((v) => serializeMapVersion(v))
      .filter(Boolean);

    res.json({ versions: parsed });
  } catch (error) {
    console.error('Get map versions error:', error);
    res.status(500).json({ error: 'Failed to get map versions' });
  }
});

// POST /api/maps/:id/versions - Create a new version
router.post('/maps/:id/versions', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { root, orphans, connections, colors, connectionColors, name, notes } = req.body;

    if (!root) {
      return res.status(400).json({ error: 'Map data is required' });
    }

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_VERSION_CREATE,
      failureError: 'Map not found',
    })) return;

    const nextVersion = collaborationEnabled
      ? await mapStore.getNextMapVersionNumberByMapAsync(id)
      : await mapStore.getNextMapVersionNumberAsync(id, req.user.id);

    const versionId = uuidv4();
    const title = name?.trim() || 'Updated';
    const sanitizedTree = sanitizeMapTreeForStorage({ root, orphans });

    await mapStore.createMapVersionAsync({
      id: versionId,
      mapId: id,
      userId: req.user.id,
      versionNumber: nextVersion,
      name: title,
      notes: notes?.trim() || null,
      rootData: JSON.stringify(sanitizedTree.root),
      orphansData: sanitizedTree.orphans ? JSON.stringify(sanitizedTree.orphans) : null,
      connectionsData: connections ? JSON.stringify(connections) : null,
      colors: colors ? JSON.stringify(colors) : null,
      connectionColors: connectionColors ? JSON.stringify(connectionColors) : null,
    });

    const allVersions = collaborationEnabled
      ? await mapStore.listMapVersionIdsByMapAsync(id)
      : await mapStore.listMapVersionIdsForUserMapAsync(id, req.user.id);

    if (allVersions.length > 25) {
      const toDelete = allVersions.slice(25).map((row) => row.id);
      await mapStore.deleteMapVersionsByIdsAsync(toDelete);
    }

    const saved = await mapStore.getMapVersionByIdAsync(versionId);

    await ensureCollaborationActivitySchemaAsync();

    const actorRole = permissionPolicy.resolveResourceRole({
      actorUserId: req.user?.id || null,
      resourceOwnerUserId: map.user_id || null,
      membershipRole: map.membership_role || map.membershipRole || null,
    });
    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: ACTIVITY_TYPES.VERSION_SAVED,
      eventScope: ACTIVITY_SCOPES.VERSION,
      entityType: 'version',
      entityId: versionId,
      summary: `Saved version ${nextVersion}: ${title}`,
      payload: {
        versionId,
        versionNumber: nextVersion,
        name: title,
        notes: notes?.trim() || null,
      },
    }, { label: 'map version save' });

    res.json({ version: serializeMapVersion(saved) });
  } catch (error) {
    console.error('Create map version error:', error);
    res.status(500).json({ error: 'Failed to create map version' });
  }
});

// PATCH /api/maps/:id/versions/:versionId - Bookmark and rename an existing version
router.patch('/maps/:id/versions/:versionId', requireAuth, async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const title = String(req.body?.name || '').trim();
    const notes = String(req.body?.notes || '').trim();

    if (!title) {
      return res.status(400).json({ error: 'Version name is required' });
    }

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_VERSION_UPDATE,
      failureError: 'Map not found',
    })) return;

    const existingVersion = await mapStore.getMapVersionByIdAsync(versionId);
    if (!existingVersion || existingVersion.map_id !== id) {
      return res.status(404).json({ error: 'Version not found' });
    }

    await mapStore.updateMapVersionBookmarkAsync({
      mapId: id,
      versionId,
      name: title,
      notes,
      bookmarkedByUserId: req.user.id,
    });

    const saved = await mapStore.getMapVersionByIdAsync(versionId);

    await ensureCollaborationActivitySchemaAsync();
    const actorRole = permissionPolicy.resolveResourceRole({
      actorUserId: req.user?.id || null,
      resourceOwnerUserId: map.user_id || null,
      membershipRole: map.membership_role || map.membershipRole || null,
    });
    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: ACTIVITY_TYPES.VERSION_BOOKMARKED,
      eventScope: ACTIVITY_SCOPES.VERSION,
      entityType: 'version',
      entityId: versionId,
      summary: `Bookmarked version ${saved.version_number}: ${title}`,
      payload: {
        versionId,
        versionNumber: saved.version_number,
        name: title,
        notes: notes || null,
      },
    }, { label: 'map version bookmark' });

    res.json({ version: serializeMapVersion(saved) });
  } catch (error) {
    console.error('Update map version error:', error);
    res.status(500).json({ error: 'Failed to update version' });
  }
});

// GET /api/maps/:id/comments - list comments for a saved map
router.get('/maps/:id/comments', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await mapCommentStore.ensureMapCommentSchemaAsync();

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = await getCommentAccessibleMapAsync(id, req.user.id, collaborationEnabled);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_READ,
      failureError: 'Map not found',
    })) return;

    await ensureLegacyMapCommentsImportedAsync(map);
    const rows = await mapCommentStore.listCommentsByMapAsync(id);

    res.json({
      commentsByNode: buildCommentsByNode(rows),
      totalComments: rows.length,
    });
  } catch (error) {
    console.error('Get map comments error:', error);
    res.status(500).json({ error: 'Failed to load map comments' });
  }
});

// POST /api/maps/:id/comments - create a comment or reply on a node
router.post('/maps/:id/comments', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { node_id, parent_comment_id, text } = req.body || {};
    const trimmedText = String(text || '').trim();
    const nodeId = String(node_id || '').trim();
    const parentCommentId = parent_comment_id ? String(parent_comment_id).trim() : null;

    if (!nodeId) {
      return res.status(400).json({ error: 'node_id is required' });
    }
    if (!trimmedText) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    await mapCommentStore.ensureMapCommentSchemaAsync();

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = await getCommentAccessibleMapAsync(id, req.user.id, collaborationEnabled);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_COMMENT,
      failureError: 'Map not found',
    })) return;

    await ensureLegacyMapCommentsImportedAsync(map);
    const nodeIds = getMapNodeIdSet(map);
    if (!nodeIds.has(nodeId)) {
      return res.status(400).json({ error: 'Target node was not found in the map' });
    }

    if (parentCommentId) {
      const parentComment = await mapCommentStore.getCommentByIdAsync(parentCommentId);
      if (!parentComment || parentComment.map_id !== id || parentComment.node_id !== nodeId) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }
    }

    const createdComment = await mapCommentStore.createCommentAsync({
      mapId: id,
      nodeId,
      parentCommentId,
      authorUserId: req.user.id,
      authorName: req.user?.name || 'Anonymous',
      authorEmail: req.user?.email || null,
      text: trimmedText,
      mentions: parseCommentMentions(trimmedText),
    });

    const actorRole = permissionPolicy.resolveResourceRole({
      actorUserId: req.user?.id || null,
      resourceOwnerUserId: map.user_id || null,
      membershipRole: map.membership_role || map.membershipRole || null,
    });
    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: ACTIVITY_TYPES.COMMENT_CREATED,
      eventScope: ACTIVITY_SCOPES.COMMENT,
      entityType: 'comment',
      entityId: createdComment.id,
      summary: parentCommentId ? 'Replied to comment' : 'Added comment',
      payload: {
        commentId: createdComment.id,
        nodeId,
        parentCommentId,
        text: trimmedText,
      },
    }, { label: 'map comment create' });

    res.status(201).json({ comment: serializeMapComment(createdComment) });
  } catch (error) {
    console.error('Create map comment error:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// PATCH /api/maps/:id/comments/:commentId - update comment text or completion state
router.patch('/maps/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const hasText = Object.prototype.hasOwnProperty.call(req.body || {}, 'text');
    const hasCompleted = Object.prototype.hasOwnProperty.call(req.body || {}, 'completed');
    if (!hasText && !hasCompleted) {
      return res.status(400).json({ error: 'No comment changes provided' });
    }

    await mapCommentStore.ensureMapCommentSchemaAsync();

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = await getCommentAccessibleMapAsync(id, req.user.id, collaborationEnabled);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_COMMENT,
      failureError: 'Map not found',
    })) return;

    await ensureLegacyMapCommentsImportedAsync(map);
    const existingComment = await mapCommentStore.getCommentByIdAsync(commentId);
    if (!existingComment || existingComment.map_id !== id) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    let updatedComment = existingComment;
    const actorRole = permissionPolicy.resolveResourceRole({
      actorUserId: req.user?.id || null,
      resourceOwnerUserId: map.user_id || null,
      membershipRole: map.membership_role || map.membershipRole || null,
    });

    if (hasText) {
      const trimmedText = String(req.body?.text || '').trim();
      if (!trimmedText) {
        return res.status(400).json({ error: 'Comment text is required' });
      }
      updatedComment = await mapCommentStore.replaceCommentTextAsync({
        commentId,
        text: trimmedText,
        mentions: parseCommentMentions(trimmedText),
      });
      await recordMapActivityBestEffortAsync({
        mapId: id,
        actorUserId: req.user.id,
        actorRole,
        eventType: ACTIVITY_TYPES.COMMENT_UPDATED,
        eventScope: ACTIVITY_SCOPES.COMMENT,
        entityType: 'comment',
        entityId: commentId,
        summary: 'Updated comment',
        payload: {
          commentId,
          nodeId: existingComment.node_id,
          text: trimmedText,
        },
      }, { label: 'map comment update text' });
    }

    if (hasCompleted) {
      const completed = !!req.body?.completed;
      updatedComment = await mapCommentStore.setCommentCompletedAsync({
        commentId,
        completed,
        completedByUserId: completed ? req.user.id : null,
        completedByName: completed ? (req.user?.name || 'Anonymous') : null,
        completedAt: completed ? new Date().toISOString() : null,
      });
      await recordMapActivityBestEffortAsync({
        mapId: id,
        actorUserId: req.user.id,
        actorRole,
        eventType: completed ? ACTIVITY_TYPES.COMMENT_RESOLVED : ACTIVITY_TYPES.COMMENT_REOPENED,
        eventScope: ACTIVITY_SCOPES.COMMENT,
        entityType: 'comment',
        entityId: commentId,
        summary: completed ? 'Resolved comment' : 'Reopened comment',
        payload: {
          commentId,
          nodeId: existingComment.node_id,
          completed,
        },
      }, { label: 'map comment update status' });
    }

    res.json({ comment: serializeMapComment(updatedComment) });
  } catch (error) {
    console.error('Update map comment error:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// DELETE /api/maps/:id/comments/:commentId - delete a comment thread
router.delete('/maps/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    await mapCommentStore.ensureMapCommentSchemaAsync();

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = await getCommentAccessibleMapAsync(id, req.user.id, collaborationEnabled);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_COMMENT,
      failureError: 'Map not found',
    })) return;

    await ensureLegacyMapCommentsImportedAsync(map);
    const existingComment = await mapCommentStore.getCommentByIdAsync(commentId);
    if (!existingComment || existingComment.map_id !== id) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const deleted = await mapCommentStore.deleteCommentThreadAsync(commentId, id);
    if (!deleted) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const actorRole = permissionPolicy.resolveResourceRole({
      actorUserId: req.user?.id || null,
      resourceOwnerUserId: map.user_id || null,
      membershipRole: map.membership_role || map.membershipRole || null,
    });
    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: ACTIVITY_TYPES.COMMENT_DELETED,
      eventScope: ACTIVITY_SCOPES.COMMENT,
      entityType: 'comment',
      entityId: commentId,
      summary: 'Deleted comment',
      payload: {
        commentId,
        nodeId: existingComment.node_id,
      },
    }, { label: 'map comment delete' });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete map comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// ============================================
// SCAN HISTORY
// ============================================

// GET /api/history - Get scan history for current user
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

    const history = await historyStore.listHistoryByUserAsync(req.user.id, { limit, offset });
    const total = await historyStore.countHistoryByUserAsync(req.user.id);

    // Parse JSON fields
    const parsed = history.map(h => ({
      ...h,
      ...parseMapFields(h),
      scan_options: safeParse(h.scan_options, 'scan_options', null),
      insights: safeParse(h.insights_data, 'insights_data', null),
      insights_generated_at: h.insights_generated_at || null,
      scan_depth: h.scan_depth ?? null,
      map_id: h.map_id || null,
    }));

    res.json({ history: parsed, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// POST /api/history - Add to scan history
router.post('/history', requireAuth, async (req, res) => {
  try {
    const { url, hostname, title, page_count, root, orphans, connections, colors, connectionColors, scan_options, scan_depth, map_id } = req.body;

    if (!root) {
      return res.status(400).json({ error: 'Scan data is required' });
    }

    const historyId = uuidv4();
    const sanitizedTree = sanitizeMapTreeForStorage({ root, orphans });

    await historyStore.createHistoryAsync({
      id: historyId,
      userId: req.user.id,
      url: url || sanitizedTree.root?.url || '',
      hostname: hostname || '',
      title: title || '',
      pageCount: page_count || 0,
      rootData: JSON.stringify(sanitizedTree.root),
      orphansData: sanitizedTree.orphans ? JSON.stringify(sanitizedTree.orphans) : null,
      connectionsData: connections ? JSON.stringify(connections) : null,
      colors: colors ? JSON.stringify(colors) : null,
      connectionColors: connectionColors ? JSON.stringify(connectionColors) : null,
      scanOptions: scan_options ? JSON.stringify(scan_options) : null,
      scanDepth: scan_depth ?? null,
      mapId: map_id || null,
    });

    // Keep only last 50 entries
    await historyStore.trimHistoryByUserAsync(req.user.id, 50);

    res.json({ success: true, id: historyId });
  } catch (error) {
    console.error('Add history error:', error);
    res.status(500).json({ error: 'Failed to add to history' });
  }
});

// PUT /api/history/:id - Update a history item (e.g., attach saved map)
router.put('/history/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { map_id } = req.body || {};

    const historyItem = await historyStore.getHistoryItemForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: historyItem,
      action: permissionPolicy.ACTIONS.HISTORY_UPDATE,
      failureError: 'History item not found',
    })) return;

    await historyStore.updateHistoryMapIdAsync(id, map_id || null);

    res.json({ success: true });
  } catch (error) {
    console.error('Update history error:', error);
    res.status(500).json({ error: 'Failed to update history' });
  }
});

// GET /api/history/:id/insights - Get saved insights for a scan history item
router.get('/history/:id/insights', requireAuth, async (req, res) => {
  try {
    await historyStore.ensureHistorySchemaAsync();
    const { id } = req.params;
    const historyItem = await historyStore.getHistoryItemForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: historyItem,
      action: permissionPolicy.ACTIONS.HISTORY_UPDATE,
      failureError: 'History item not found',
    })) return;

    res.json({
      insights: safeParse(historyItem.insights_data, 'insights_data', null),
      insights_generated_at: historyItem.insights_generated_at || null,
    });
  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({ error: 'Failed to get insights' });
  }
});

// POST /api/insights/analyze - Run deterministic Map Insights from current scan data
router.post('/insights/analyze', async (req, res) => {
  try {
    await historyStore.ensureHistorySchemaAsync();
    await mapStore.ensureMapInsightsSchemaAsync();
    const {
      root,
      orphans = [],
      scan_meta,
      scanMeta,
      history_id,
      scan_id,
      map_id,
    } = req.body || {};

    if (!root || typeof root !== 'object') {
      return res.status(400).json({ error: 'Scan data is required' });
    }

    let historyItem = null;
    let mapItem = null;
    let canPersistMapInsights = false;
    if (history_id) {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Sign in to save insights for this scan' });
      }
      historyItem = await historyStore.getHistoryItemForUserAsync(history_id, req.user.id);
      if (!ensureResourceAction({
        req,
        res,
        resource: historyItem,
        action: permissionPolicy.ACTIONS.HISTORY_UPDATE,
        failureError: 'History item not found',
      })) return;
    }
    if (map_id && req.user?.id) {
      const { map, role } = await resolveMapPermissionContextAsync({
        mapId: map_id,
        actorUserId: req.user.id,
      });
      if (!map || !permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, role)) {
        return res.status(404).json({ error: 'Map not found' });
      }
      mapItem = map;
      canPersistMapInsights = permissionPolicy.can(permissionPolicy.ACTIONS.MAP_UPDATE, role);
    }

    const insights = analyzeMapInsights({
      root,
      orphans: Array.isArray(orphans) ? orphans : [],
      scanMeta: scanMeta || scan_meta || {},
      scanId: scan_id || history_id || map_id || null,
      historyId: history_id || null,
    });

    if (historyItem) {
      await historyStore.updateHistoryInsightsAsync(
        history_id,
        req.user.id,
        JSON.stringify(insights),
        insights.updatedAt
      );
    }
    if (mapItem && canPersistMapInsights) {
      await mapStore.updateMapInsightsAsync(map_id, JSON.stringify(insights), insights.updatedAt);
    }

    res.json({ insights, saved: !!historyItem || (mapItem && canPersistMapInsights) });
  } catch (error) {
    console.error('Analyze insights error:', error);
    res.status(500).json({ error: 'Failed to analyze scan' });
  }
});

// DELETE /api/history - Delete history items
router.delete('/history', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs are required' });
    }

    await historyStore.deleteHistoryByIdsForUserAsync(ids, req.user.id);

    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    console.error('Delete history error:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

// ============================================
// SHARES
// ============================================

// POST /api/shares - Create a share link
router.post('/shares', requireAuth, async (req, res) => {
  try {
    const { map_id, root, orphans, connections, colors, connectionColors, expires_in_days } = req.body;

    if (!root) {
      return res.status(400).json({ error: 'Map data is required' });
    }

    // If map_id provided, verify ownership
    if (map_id) {
      const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
      const map = collaborationEnabled
        ? await mapStore.getMapAccessibleToUserAsync(map_id, req.user.id)
        : await mapStore.getMapForUserAsync(map_id, req.user.id);
      if (!ensureResourceAction({
        req,
        res,
        resource: map,
        action: permissionPolicy.ACTIONS.SHARE_CREATE,
        failureStatus: 400,
        failureError: 'Map not found',
      })) return;
    }

    const shareId = uuidv4();
    const sanitizedTree = sanitizeMapTreeForStorage({ root, orphans });
    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await shareStore.createShareAsync({
      id: shareId,
      mapId: map_id || null,
      userId: req.user.id,
      rootData: JSON.stringify(sanitizedTree.root),
      orphansData: sanitizedTree.orphans ? JSON.stringify(sanitizedTree.orphans) : null,
      connectionsData: connections ? JSON.stringify(connections) : null,
      colors: colors ? JSON.stringify(colors) : null,
      connectionColors: connectionColors ? JSON.stringify(connectionColors) : null,
      expiresAt,
    });

    res.json({
      share: {
        id: shareId,
        expiresAt,
      },
    });
  } catch (error) {
    console.error('Create share error:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// GET /api/shares/:id - Get a shared map (public, no auth required)
router.get('/shares/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const share = await shareStore.getShareWithUserByIdAsync(id);

    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This share link has expired' });
    }

    if (share.map_id) {
      const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
      if (collaborationEnabled) {
        const actorUserId = req.user?.id || null;
        const { map, role } = await resolveMapPermissionContextAsync({
          mapId: share.map_id,
          actorUserId,
        });

        if (!map || !permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, role)) {
          return res.status(403).json({
            error: 'This shared map now requires app access',
            code: 'SHARE_ACCESS_REQUIRED',
            mapId: share.map_id,
          });
        }
      }
    }

    // Increment view count
    await shareStore.incrementShareViewCountAsync(id);

    res.json({
      share: {
        id: share.id,
        ...parseMapFields(share),
        sharedBy: share.shared_by_name,
        createdAt: share.created_at,
        viewCount: share.view_count + 1,
      },
    });
  } catch (error) {
    console.error('Get share error:', error);
    res.status(500).json({ error: 'Failed to get shared map' });
  }
});

// DELETE /api/shares/:id - Delete a share link
router.delete('/shares/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const share = await shareStore.getShareForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: share,
      action: permissionPolicy.ACTIONS.SHARE_DELETE,
      failureError: 'Share not found',
    })) return;

    await shareStore.deleteShareAsync(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete share error:', error);
    res.status(500).json({ error: 'Failed to delete share link' });
  }
});

// GET /api/shares - Get all shares created by current user
router.get('/shares', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const shares = await shareStore.listSharesByUserAsync(req.user.id, { limit, offset });
    const total = await shareStore.countSharesByUserAsync(req.user.id);

    res.json({ shares, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('Get shares error:', error);
    res.status(500).json({ error: 'Failed to get shares' });
  }
});

module.exports = router;
