const adapter = require('../stores/dbAdapter');
const mapStore = require('../stores/mapStore');
const coeditingStore = require('../stores/coeditingStore');

const LIVE_OP_REPLAY_LIMIT_DEFAULT = 200;
const LIVE_OP_REPLAY_LIMIT_MAX = 500;

const ALLOWED_METADATA_FIELDS = Object.freeze([
  'name',
  'notes',
  'colors',
  'connectionColors',
]);

class CoeditingSyncError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.name = 'CoeditingSyncError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonSafe(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeNullableString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeTimestampMarker(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : value.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? trimmed : new Date(parsed).toISOString();
  }

  if (typeof value?.toISOString === 'function') {
    try {
      const iso = value.toISOString();
      return normalizeNullableString(iso);
    } catch {
      // Fall through to string normalization.
    }
  }

  return normalizeNullableString(value);
}

function cloneDocument(document) {
  return structuredClone(document);
}

function parseMapRowToDocument(mapRow) {
  return {
    mapId: mapRow.id,
    version: 0,
    name: normalizeNullableString(mapRow.name) || 'Untitled Map',
    notes: normalizeNullableString(mapRow.notes),
    root: parseJsonSafe(mapRow.root_data, null),
    orphans: parseJsonSafe(mapRow.orphans_data, []),
    connections: normalizeConnections(parseJsonSafe(mapRow.connections_data, [])),
    colors: parseJsonSafe(mapRow.colors, null),
    connectionColors: parseJsonSafe(mapRow.connection_colors, null),
    mapUpdatedAt: normalizeTimestampMarker(mapRow.updated_at),
    lastOpId: null,
    lastActorId: null,
  };
}

function parseSnapshotRowToDocument(snapshotRow) {
  return {
    mapId: snapshotRow.map_id,
    version: Number(snapshotRow.version || 0),
    name: normalizeNullableString(snapshotRow.name) || 'Untitled Map',
    notes: normalizeNullableString(snapshotRow.notes),
    root: parseJsonSafe(snapshotRow.root_data, null),
    orphans: parseJsonSafe(snapshotRow.orphans_data, []),
    connections: normalizeConnections(parseJsonSafe(snapshotRow.connections_data, [])),
    colors: parseJsonSafe(snapshotRow.colors, null),
    connectionColors: parseJsonSafe(snapshotRow.connection_colors, null),
    mapUpdatedAt: normalizeTimestampMarker(snapshotRow.map_updated_at),
    lastOpId: snapshotRow.last_op_id || null,
    lastActorId: snapshotRow.last_actor_id || null,
  };
}

function normalizeConnectionShape(connection) {
  const base = isPlainObject(connection) ? structuredClone(connection) : {};
  const sourceNodeId = normalizeNullableString(base.sourceNodeId || base.sourceId);
  const targetNodeId = normalizeNullableString(base.targetNodeId || base.targetId);
  const id = normalizeNullableString(base.id)
    || (sourceNodeId && targetNodeId
      ? `link-${sourceNodeId}-${targetNodeId}-${normalizeNullableString(base.type) || 'connection'}`
      : null);

  return {
    ...base,
    id,
    sourceNodeId,
    targetNodeId,
  };
}

function normalizeConnections(connections) {
  if (!Array.isArray(connections)) return [];
  return connections
    .map((connection) => normalizeConnectionShape(connection))
    .filter((connection) => connection.id && connection.sourceNodeId && connection.targetNodeId);
}

function serializeDocument(document) {
  return {
    mapId: document.mapId,
    version: Number(document.version || 0),
    name: normalizeNullableString(document.name) || 'Untitled Map',
    notes: normalizeNullableString(document.notes),
    rootData: JSON.stringify(document.root),
    orphansData: JSON.stringify(Array.isArray(document.orphans) ? document.orphans : []),
    connectionsData: JSON.stringify(normalizeConnections(document.connections)),
    colors: document.colors === null || document.colors === undefined
      ? null
      : JSON.stringify(document.colors),
    connectionColors: document.connectionColors === null || document.connectionColors === undefined
      ? null
      : JSON.stringify(document.connectionColors),
    mapUpdatedAt: normalizeTimestampMarker(document.mapUpdatedAt),
    lastOpId: document.lastOpId || null,
    lastActorId: document.lastActorId || null,
  };
}

function summarizeDocument(document) {
  return {
    mapId: document.mapId,
    version: Number(document.version || 0),
    name: document.name,
    notes: document.notes,
    mapUpdatedAt: normalizeTimestampMarker(document.mapUpdatedAt),
    lastOpId: document.lastOpId || null,
    lastActorId: document.lastActorId || null,
  };
}

function findNodeByIdInTree(node, nodeId) {
  if (!node) return null;
  if (node.id === nodeId) return node;
  for (const child of node.children || []) {
    const found = findNodeByIdInTree(child, nodeId);
    if (found) return found;
  }
  return null;
}

function findNodeByIdInDocument(document, nodeId) {
  if (!nodeId) return null;
  if (document.root) {
    const foundInRoot = findNodeByIdInTree(document.root, nodeId);
    if (foundInRoot) return foundInRoot;
  }
  for (const orphan of document.orphans || []) {
    const foundInOrphan = findNodeByIdInTree(orphan, nodeId);
    if (foundInOrphan) return foundInOrphan;
  }
  return null;
}

function findParentInTree(node, nodeId, parent = null) {
  if (!node) return null;
  if (node.id === nodeId) return parent;
  for (const child of node.children || []) {
    const found = findParentInTree(child, nodeId, node);
    if (found) return found;
  }
  return null;
}

function findParentInDocument(document, nodeId) {
  if (!nodeId) return null;
  if (document.root) {
    const foundInRoot = findParentInTree(document.root, nodeId);
    if (foundInRoot) return foundInRoot;
  }
  for (const orphan of document.orphans || []) {
    const foundInOrphan = findParentInTree(orphan, nodeId);
    if (foundInOrphan) return foundInOrphan;
  }
  return null;
}

function collectNodeIds(node, out = new Set()) {
  if (!node?.id) return out;
  out.add(node.id);
  for (const child of node.children || []) {
    collectNodeIds(child, out);
  }
  return out;
}

function ensureUniqueNodeIds(document, nodeIds) {
  for (const nodeId of nodeIds) {
    if (findNodeByIdInDocument(document, nodeId)) {
      throw new CoeditingSyncError(
        'COEDITING_NODE_EXISTS',
        `Node "${nodeId}" already exists`,
        409,
        { nodeId }
      );
    }
  }
}

function ensureNodeExists(document, nodeId) {
  const node = findNodeByIdInDocument(document, nodeId);
  if (!node) {
    throw new CoeditingSyncError(
      'COEDITING_NODE_NOT_FOUND',
      `Node "${nodeId}" was not found`,
      404,
      { nodeId }
    );
  }
  return node;
}

function insertAfterId(list, item, afterId = null) {
  if (!Array.isArray(list)) {
    throw new CoeditingSyncError(
      'COEDITING_INVALID_COLLECTION',
      'Target collection is not an array',
      500
    );
  }

  if (!afterId) {
    list.push(item);
    return list.length - 1;
  }

  const index = list.findIndex((entry) => entry?.id === afterId);
  if (index === -1) {
    throw new CoeditingSyncError(
      'COEDITING_AFTER_NODE_NOT_FOUND',
      `Sibling "${afterId}" was not found`,
      400,
      { afterNodeId: afterId }
    );
  }

  list.splice(index + 1, 0, item);
  return index + 1;
}

function removeNodeFromChildren(list, nodeId) {
  if (!Array.isArray(list)) return null;

  const index = list.findIndex((child) => child?.id === nodeId);
  if (index !== -1) {
    return list.splice(index, 1)[0] || null;
  }

  for (const child of list) {
    const removed = removeNodeFromChildren(child?.children, nodeId);
    if (removed) return removed;
  }

  return null;
}

function removeNodeFromDocument(document, nodeId) {
  if (document.root?.id === nodeId) {
    return { removedNode: document.root, rootNode: true };
  }

  const topLevelIndex = (document.orphans || []).findIndex((node) => node?.id === nodeId);
  if (topLevelIndex !== -1) {
    return {
      removedNode: document.orphans.splice(topLevelIndex, 1)[0] || null,
      rootNode: false,
    };
  }

  return {
    removedNode: removeNodeFromChildren(document.root?.children, nodeId)
      || removeNodeFromChildren(document.orphans, nodeId),
    rootNode: false,
  };
}

function removeConnectionsForNodeIds(document, nodeIds) {
  const targetIds = new Set(nodeIds);
  document.connections = normalizeConnections(document.connections).filter((connection) => (
    !targetIds.has(connection.sourceNodeId) && !targetIds.has(connection.targetNodeId)
  ));
}

function buildStoredNode(payloadNode, nodeId) {
  if (!isPlainObject(payloadNode)) {
    throw new CoeditingSyncError(
      'COEDITING_INVALID_NODE_PAYLOAD',
      'payload.node must be an object',
      400
    );
  }

  const nextNode = structuredClone(payloadNode);
  nextNode.id = nodeId;
  nextNode.children = Array.isArray(nextNode.children) ? nextNode.children : [];
  return nextNode;
}

function applyNodeAdd(document, operation) {
  const { nodeId, parentId, afterNodeId, node } = operation.payload;
  const newNode = buildStoredNode(node, nodeId);
  const subtreeIds = collectNodeIds(newNode);

  if (subtreeIds.size === 0) {
    throw new CoeditingSyncError(
      'COEDITING_INVALID_NODE_PAYLOAD',
      'payload.node must include a valid id',
      400
    );
  }

  ensureUniqueNodeIds(document, subtreeIds);

  if (!document.root) {
    document.root = newNode;
    return;
  }

  if (!parentId) {
    document.orphans = Array.isArray(document.orphans) ? document.orphans : [];
    insertAfterId(document.orphans, newNode, afterNodeId);
    return;
  }

  const parent = ensureNodeExists(document, parentId);
  parent.children = Array.isArray(parent.children) ? parent.children : [];
  insertAfterId(parent.children, newNode, afterNodeId);
}

function applyNodeUpdate(document, operation) {
  const node = ensureNodeExists(document, operation.payload.nodeId);
  const changes = isPlainObject(operation.payload.changes)
    ? structuredClone(operation.payload.changes)
    : null;

  if (!changes) {
    throw new CoeditingSyncError(
      'COEDITING_INVALID_NODE_CHANGES',
      'payload.changes must be an object',
      400
    );
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'children')) {
    throw new CoeditingSyncError(
      'COEDITING_UNSUPPORTED_NODE_CHANGE',
      'Node children updates are not supported in node.update',
      400,
      { field: 'children' }
    );
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'parentId')
    || Object.prototype.hasOwnProperty.call(changes, 'afterNodeId')
    || Object.prototype.hasOwnProperty.call(changes, 'subdomainRoot')
    || Object.prototype.hasOwnProperty.call(changes, 'orphanType')) {
    throw new CoeditingSyncError(
      'COEDITING_UNSUPPORTED_NODE_CHANGE',
      'Structural node moves are not supported in node.update',
      400
    );
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'id') && changes.id !== operation.payload.nodeId) {
    throw new CoeditingSyncError(
      'COEDITING_UNSUPPORTED_NODE_CHANGE',
      'Node id cannot be changed',
      400,
      { field: 'id' }
    );
  }

  delete changes.id;
  Object.assign(node, changes);
}

function applyNodeDelete(document, operation) {
  const { removedNode, rootNode } = removeNodeFromDocument(document, operation.payload.nodeId);

  if (rootNode) {
    throw new CoeditingSyncError(
      'COEDITING_ROOT_DELETE_FORBIDDEN',
      'Deleting the root node is not supported',
      400
    );
  }

  if (!removedNode) {
    throw new CoeditingSyncError(
      'COEDITING_NODE_NOT_FOUND',
      `Node "${operation.payload.nodeId}" was not found`,
      404,
      { nodeId: operation.payload.nodeId }
    );
  }

  removeConnectionsForNodeIds(document, collectNodeIds(removedNode));
}

function ensureLinkIndex(document, linkId) {
  const index = normalizeConnections(document.connections).findIndex((connection) => connection.id === linkId);
  if (index === -1) {
    throw new CoeditingSyncError(
      'COEDITING_LINK_NOT_FOUND',
      `Link "${linkId}" was not found`,
      404,
      { linkId }
    );
  }
  return index;
}

function validateLinkEndpoints(document, sourceNodeId, targetNodeId) {
  if (!sourceNodeId || !targetNodeId) {
    throw new CoeditingSyncError(
      'COEDITING_INVALID_LINK',
      'Link endpoints are required',
      400
    );
  }
  if (sourceNodeId === targetNodeId) {
    throw new CoeditingSyncError(
      'COEDITING_INVALID_LINK',
      'Self-referential links are not supported',
      400
    );
  }

  ensureNodeExists(document, sourceNodeId);
  ensureNodeExists(document, targetNodeId);
}

function applyLinkAdd(document, operation) {
  document.connections = normalizeConnections(document.connections);

  if (document.connections.some((connection) => connection.id === operation.payload.linkId)) {
    throw new CoeditingSyncError(
      'COEDITING_LINK_EXISTS',
      `Link "${operation.payload.linkId}" already exists`,
      409,
      { linkId: operation.payload.linkId }
    );
  }

  validateLinkEndpoints(document, operation.payload.sourceId, operation.payload.targetId);
  const storedLink = normalizeConnectionShape({
    ...(isPlainObject(operation.payload.link) ? operation.payload.link : {}),
    id: operation.payload.linkId,
    sourceNodeId: operation.payload.sourceId,
    targetNodeId: operation.payload.targetId,
  });

  document.connections.push(storedLink);
}

function applyLinkUpdate(document, operation) {
  document.connections = normalizeConnections(document.connections);
  const index = ensureLinkIndex(document, operation.payload.linkId);
  const current = document.connections[index];
  const changes = isPlainObject(operation.payload.changes)
    ? structuredClone(operation.payload.changes)
    : null;

  if (!changes) {
    throw new CoeditingSyncError(
      'COEDITING_INVALID_LINK_CHANGES',
      'payload.changes must be an object',
      400
    );
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'id') && changes.id !== operation.payload.linkId) {
    throw new CoeditingSyncError(
      'COEDITING_UNSUPPORTED_LINK_CHANGE',
      'Link id cannot be changed',
      400,
      { field: 'id' }
    );
  }

  const nextConnection = normalizeConnectionShape({
    ...current,
    ...changes,
    id: operation.payload.linkId,
    sourceNodeId: changes.sourceNodeId || changes.sourceId || current.sourceNodeId,
    targetNodeId: changes.targetNodeId || changes.targetId || current.targetNodeId,
  });

  validateLinkEndpoints(document, nextConnection.sourceNodeId, nextConnection.targetNodeId);
  document.connections[index] = nextConnection;
}

function applyLinkDelete(document, operation) {
  document.connections = normalizeConnections(document.connections);
  const index = document.connections.findIndex((connection) => connection.id === operation.payload.linkId);
  if (index === -1) {
    throw new CoeditingSyncError(
      'COEDITING_LINK_NOT_FOUND',
      `Link "${operation.payload.linkId}" was not found`,
      404,
      { linkId: operation.payload.linkId }
    );
  }
  document.connections.splice(index, 1);
}

function applyMetadataUpdate(document, operation) {
  const changes = isPlainObject(operation.payload.changes)
    ? structuredClone(operation.payload.changes)
    : null;

  if (!changes) {
    throw new CoeditingSyncError(
      'COEDITING_INVALID_METADATA',
      'payload.changes must be an object',
      400
    );
  }

  for (const key of Object.keys(changes)) {
    if (!ALLOWED_METADATA_FIELDS.includes(key)) {
      throw new CoeditingSyncError(
        'COEDITING_UNSUPPORTED_METADATA_FIELD',
        `Metadata field "${key}" is not supported`,
        400,
        { field: key }
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'name')) {
    document.name = normalizeNullableString(changes.name) || 'Untitled Map';
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'notes')) {
    document.notes = normalizeNullableString(changes.notes);
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'colors')) {
    if (!Array.isArray(changes.colors)) {
      throw new CoeditingSyncError(
        'COEDITING_INVALID_METADATA',
        'colors must be an array',
        400,
        { field: 'colors' }
      );
    }
    document.colors = structuredClone(changes.colors);
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'connectionColors')) {
    if (!isPlainObject(changes.connectionColors)) {
      throw new CoeditingSyncError(
        'COEDITING_INVALID_METADATA',
        'connectionColors must be an object',
        400,
        { field: 'connectionColors' }
      );
    }
    document.connectionColors = structuredClone(changes.connectionColors);
  }
}

function applyOperationToDocument(document, operation) {
  const nextDocument = cloneDocument(document);

  switch (operation.type) {
    case 'node.add':
      applyNodeAdd(nextDocument, operation);
      break;
    case 'node.update':
      applyNodeUpdate(nextDocument, operation);
      break;
    case 'node.delete':
      applyNodeDelete(nextDocument, operation);
      break;
    case 'link.add':
      applyLinkAdd(nextDocument, operation);
      break;
    case 'link.update':
      applyLinkUpdate(nextDocument, operation);
      break;
    case 'link.delete':
      applyLinkDelete(nextDocument, operation);
      break;
    case 'metadata.update':
      applyMetadataUpdate(nextDocument, operation);
      break;
    default:
      throw new CoeditingSyncError(
        'COEDITING_UNSUPPORTED_OPERATION',
        `Operation type "${operation.type}" is not supported`,
        400,
        { type: operation.type }
      );
  }

  return nextDocument;
}

function replayOperations(baseDocument, operations) {
  let nextDocument = cloneDocument(baseDocument);
  for (const operation of operations) {
    nextDocument = applyOperationToDocument(nextDocument, operation);
  }
  return nextDocument;
}

async function createSnapshotFromMapRowAsync(mapRow) {
  const document = parseMapRowToDocument(mapRow);
  const stored = serializeDocument(document);
  const snapshotRow = await coeditingStore.createLiveSnapshotAsync({
    mapId: document.mapId,
    version: document.version,
    name: document.name,
    notes: document.notes,
    rootData: stored.rootData,
    orphansData: stored.orphansData,
    connectionsData: stored.connectionsData,
    colors: stored.colors,
    connectionColors: stored.connectionColors,
    mapUpdatedAt: document.mapUpdatedAt,
    lastOpId: null,
    lastActorId: null,
  });
  return parseSnapshotRowToDocument(snapshotRow);
}

async function refreshSnapshotFromMapRowAsync(mapRow) {
  const document = parseMapRowToDocument(mapRow);
  const stored = serializeDocument(document);
  const snapshotRow = await coeditingStore.updateLiveSnapshotAsync({
    mapId: document.mapId,
    version: document.version,
    name: document.name,
    notes: document.notes,
    rootData: stored.rootData,
    orphansData: stored.orphansData,
    connectionsData: stored.connectionsData,
    colors: stored.colors,
    connectionColors: stored.connectionColors,
    mapUpdatedAt: document.mapUpdatedAt,
    lastOpId: null,
    lastActorId: null,
  });
  return parseSnapshotRowToDocument(snapshotRow);
}

async function ensureLiveDocumentCurrentAsync(mapId) {
  await coeditingStore.ensureCoeditingSchemaAsync();

  const mapRow = await mapStore.getMapByIdAsync(mapId);
  if (!mapRow) {
    throw new CoeditingSyncError(
      'COEDITING_MAP_NOT_FOUND',
      'Map not found',
      404,
      { mapId }
    );
  }

  const snapshotRow = await coeditingStore.getLiveSnapshotByMapIdAsync(mapId);
  if (!snapshotRow) {
    const createdDocument = await createSnapshotFromMapRowAsync(mapRow);
    return { mapRow, document: createdDocument };
  }

  const document = parseSnapshotRowToDocument(snapshotRow);

  const liveMapUpdatedAt = normalizeTimestampMarker(document.mapUpdatedAt);
  const savedMapUpdatedAt = normalizeTimestampMarker(mapRow.updated_at);

  if (liveMapUpdatedAt && savedMapUpdatedAt && liveMapUpdatedAt !== savedMapUpdatedAt) {
    if (document.version === 0 && !document.lastOpId) {
      const refreshedDocument = await refreshSnapshotFromMapRowAsync(mapRow);
      return { mapRow, document: refreshedDocument };
    }

    throw new CoeditingSyncError(
      'COEDITING_MAP_DRIFT',
      'Live snapshot is stale relative to the saved map',
      409,
      {
        mapId,
        liveMapUpdatedAt,
        savedMapUpdatedAt,
        version: document.version,
      }
    );
  }

  return { mapRow, document };
}

function buildCommittedOperation(operation, version, committedAt) {
  return {
    ...operation,
    version,
    committedAt,
  };
}

function parseCommittedOperationRow(row) {
  return {
    opId: row.id,
    mapId: row.map_id,
    sessionId: row.session_id,
    actorId: row.actor_id,
    baseVersion: Number(row.base_version || 0),
    version: Number(row.version || 0),
    timestamp: row.timestamp || row.committed_at,
    type: row.type,
    payload: parseJsonSafe(row.payload, {}),
    committedAt: row.committed_at,
  };
}

const applyOperationTransactionAsync = adapter.transactionAsync(async ({ mapId, operation }) => {
  await coeditingStore.ensureCoeditingSchemaAsync();

  const existingOp = await coeditingStore.getLiveOpByIdAsync(operation.opId);
  if (existingOp) {
    if (existingOp.map_id !== mapId) {
      throw new CoeditingSyncError(
        'COEDITING_DUPLICATE_OP',
        'Operation id already exists on another map',
        409,
        { opId: operation.opId, mapId: existingOp.map_id }
      );
    }

    const snapshotRow = await coeditingStore.getLiveSnapshotByMapIdAsync(mapId);
    const liveDocument = snapshotRow ? parseSnapshotRowToDocument(snapshotRow) : null;
    return {
      duplicate: true,
      operation: parseCommittedOperationRow(existingOp),
      liveDocument: liveDocument ? summarizeDocument(liveDocument) : null,
    };
  }

  const { mapRow, document } = await ensureLiveDocumentCurrentAsync(mapId);
  if (document.version !== operation.baseVersion) {
    throw new CoeditingSyncError(
      'COEDITING_VERSION_CONFLICT',
      'Operation baseVersion does not match current live document version',
      409,
      {
        expectedBaseVersion: operation.baseVersion,
        currentVersion: document.version,
        mapUpdatedAt: document.mapUpdatedAt,
      }
    );
  }

  const nextDocument = applyOperationToDocument(document, operation);
  const nextVersion = document.version + 1;
  const committedAt = new Date().toISOString();
  const storedNextDocument = {
    ...nextDocument,
    mapId,
    version: nextVersion,
    lastOpId: operation.opId,
    lastActorId: operation.actorId,
    mapUpdatedAt: document.mapUpdatedAt,
  };

  const serialized = serializeDocument(storedNextDocument);

  await coeditingStore.createLiveOpAsync({
    id: operation.opId,
    mapId,
    version: nextVersion,
    sessionId: operation.sessionId,
    actorId: operation.actorId,
    baseVersion: operation.baseVersion,
    timestamp: operation.timestamp,
    type: operation.type,
    payload: JSON.stringify(operation.payload),
    committedAt,
  });

  await mapStore.updateMapByIdAsync(mapId, {
    name: storedNextDocument.name,
    notes: storedNextDocument.notes,
    url: normalizeNullableString(storedNextDocument.root?.url) || mapRow.url,
    rootData: serialized.rootData,
    orphansData: serialized.orphansData,
    connectionsData: serialized.connectionsData,
    colors: serialized.colors,
    connectionColors: serialized.connectionColors,
  });

  const updatedMapRow = await mapStore.getMapByIdAsync(mapId);
  if (!updatedMapRow) {
    throw new CoeditingSyncError(
      'COEDITING_MAP_NOT_FOUND',
      'Map not found after live commit',
      404,
      { mapId }
    );
  }

  storedNextDocument.mapUpdatedAt = normalizeTimestampMarker(updatedMapRow.updated_at);

  await coeditingStore.updateLiveSnapshotAsync({
    mapId,
    version: storedNextDocument.version,
    name: storedNextDocument.name,
    notes: storedNextDocument.notes,
    rootData: serialized.rootData,
    orphansData: serialized.orphansData,
    connectionsData: serialized.connectionsData,
    colors: serialized.colors,
    connectionColors: serialized.connectionColors,
    mapUpdatedAt: storedNextDocument.mapUpdatedAt,
    lastOpId: storedNextDocument.lastOpId,
    lastActorId: storedNextDocument.lastActorId,
  });

  return {
    duplicate: false,
    operation: buildCommittedOperation(operation, nextVersion, committedAt),
    liveDocument: summarizeDocument(storedNextDocument),
  };
});

async function applyOperationAsync({ mapId, operation }) {
  return applyOperationTransactionAsync({ mapId, operation });
}

async function getLiveDocumentAsync({ mapId }) {
  const { document } = await ensureLiveDocumentCurrentAsync(mapId);
  return document;
}

async function listCommittedOperationsAsync({
  mapId,
  afterVersion = 0,
  limit = LIVE_OP_REPLAY_LIMIT_DEFAULT,
}) {
  const normalizedAfterVersion = Number.isInteger(afterVersion) && afterVersion >= 0
    ? afterVersion
    : 0;
  const normalizedLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || LIVE_OP_REPLAY_LIMIT_DEFAULT, 1),
    LIVE_OP_REPLAY_LIMIT_MAX
  );

  const { document } = await ensureLiveDocumentCurrentAsync(mapId);
  const rows = await coeditingStore.listLiveOpsByMapIdAfterVersionAsync(
    mapId,
    normalizedAfterVersion,
    normalizedLimit
  );

  return {
    currentVersion: document.version,
    operations: rows.map(parseCommittedOperationRow),
  };
}

module.exports = {
  ALLOWED_METADATA_FIELDS,
  CoeditingSyncError,
  applyOperationToDocument,
  replayOperations,
  applyOperationAsync,
  getLiveDocumentAsync,
  listCommittedOperationsAsync,
  summarizeDocument,
};
