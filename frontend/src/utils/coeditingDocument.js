class CoeditingDocumentError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'CoeditingDocumentError';
    this.code = code;
    this.details = details;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneDocument(document) {
  return structuredClone(document || {});
}

function normalizeConnections(connections) {
  if (!Array.isArray(connections)) return [];
  return connections
    .map((connection) => {
      if (!isPlainObject(connection)) return null;
      const sourceNodeId = connection.sourceNodeId || connection.sourceId || null;
      const targetNodeId = connection.targetNodeId || connection.targetId || null;
      const id = connection.id
        || (sourceNodeId && targetNodeId
          ? `link-${sourceNodeId}-${targetNodeId}-${connection.type || 'connection'}`
          : null);
      if (!id || !sourceNodeId || !targetNodeId) return null;
      return {
        ...connection,
        id,
        sourceNodeId,
        targetNodeId,
      };
    })
    .filter(Boolean);
}

function normalizeLiveDocument(document = {}) {
  return {
    mapId: document.mapId || null,
    version: Number.isInteger(document.version) ? document.version : 0,
    name: typeof document.name === 'string' && document.name.trim() ? document.name : 'Untitled Map',
    notes: document.notes ?? null,
    root: document.root || null,
    orphans: Array.isArray(document.orphans) ? document.orphans : [],
    connections: normalizeConnections(document.connections),
    colors: Array.isArray(document.colors) ? document.colors : null,
    connectionColors: isPlainObject(document.connectionColors) ? document.connectionColors : null,
    lastOpId: document.lastOpId || null,
    lastActorId: document.lastActorId || null,
    mapUpdatedAt: document.mapUpdatedAt || null,
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

function collectNodeIds(node, out = new Set()) {
  if (!node?.id) return out;
  out.add(node.id);
  for (const child of node.children || []) {
    collectNodeIds(child, out);
  }
  return out;
}

function ensureNodeExists(document, nodeId) {
  const node = findNodeByIdInDocument(document, nodeId);
  if (!node) {
    throw new CoeditingDocumentError(
      'COEDITING_NODE_NOT_FOUND',
      `Node "${nodeId}" was not found`,
      { nodeId }
    );
  }
  return node;
}

function ensureUniqueNodeIds(document, nodeIds) {
  for (const nodeId of nodeIds) {
    if (findNodeByIdInDocument(document, nodeId)) {
      throw new CoeditingDocumentError(
        'COEDITING_NODE_EXISTS',
        `Node "${nodeId}" already exists`,
        { nodeId }
      );
    }
  }
}

function insertAfterId(list, item, afterId = null) {
  if (!Array.isArray(list)) {
    throw new CoeditingDocumentError(
      'COEDITING_INVALID_COLLECTION',
      'Target collection is not an array'
    );
  }

  if (!afterId) {
    list.push(item);
    return;
  }

  const index = list.findIndex((entry) => entry?.id === afterId);
  if (index === -1) {
    throw new CoeditingDocumentError(
      'COEDITING_AFTER_NODE_NOT_FOUND',
      `Sibling "${afterId}" was not found`,
      { afterNodeId: afterId }
    );
  }

  list.splice(index + 1, 0, item);
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
    throw new CoeditingDocumentError(
      'COEDITING_INVALID_NODE_PAYLOAD',
      'payload.node must be an object'
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
    throw new CoeditingDocumentError(
      'COEDITING_INVALID_NODE_CHANGES',
      'payload.changes must be an object'
    );
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'children')) {
    throw new CoeditingDocumentError(
      'COEDITING_UNSUPPORTED_NODE_CHANGE',
      'Node children updates are not supported in node.update',
      { field: 'children' }
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(changes, 'parentId')
    || Object.prototype.hasOwnProperty.call(changes, 'afterNodeId')
    || Object.prototype.hasOwnProperty.call(changes, 'subdomainRoot')
    || Object.prototype.hasOwnProperty.call(changes, 'orphanType')
  ) {
    throw new CoeditingDocumentError(
      'COEDITING_UNSUPPORTED_NODE_CHANGE',
      'Structural node moves are not supported in node.update'
    );
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'id') && changes.id !== operation.payload.nodeId) {
    throw new CoeditingDocumentError(
      'COEDITING_UNSUPPORTED_NODE_CHANGE',
      'Node id cannot be changed',
      { field: 'id' }
    );
  }

  delete changes.id;
  Object.assign(node, changes);
}

function applyNodeDelete(document, operation) {
  const { removedNode, rootNode } = removeNodeFromDocument(document, operation.payload.nodeId);

  if (rootNode) {
    throw new CoeditingDocumentError(
      'COEDITING_ROOT_DELETE_FORBIDDEN',
      'Deleting the root node is not supported'
    );
  }

  if (!removedNode) {
    throw new CoeditingDocumentError(
      'COEDITING_NODE_NOT_FOUND',
      `Node "${operation.payload.nodeId}" was not found`,
      { nodeId: operation.payload.nodeId }
    );
  }

  removeConnectionsForNodeIds(document, collectNodeIds(removedNode));
}

function validateLinkEndpoints(document, sourceNodeId, targetNodeId) {
  if (!sourceNodeId || !targetNodeId) {
    throw new CoeditingDocumentError(
      'COEDITING_INVALID_LINK',
      'Link endpoints are required'
    );
  }
  if (sourceNodeId === targetNodeId) {
    throw new CoeditingDocumentError(
      'COEDITING_INVALID_LINK',
      'Self-referential links are not supported'
    );
  }

  ensureNodeExists(document, sourceNodeId);
  ensureNodeExists(document, targetNodeId);
}

function applyLinkAdd(document, operation) {
  document.connections = normalizeConnections(document.connections);

  if (document.connections.some((connection) => connection.id === operation.payload.linkId)) {
    throw new CoeditingDocumentError(
      'COEDITING_LINK_EXISTS',
      `Link "${operation.payload.linkId}" already exists`,
      { linkId: operation.payload.linkId }
    );
  }

  validateLinkEndpoints(document, operation.payload.sourceId, operation.payload.targetId);
  document.connections.push({
    ...(isPlainObject(operation.payload.link) ? operation.payload.link : {}),
    id: operation.payload.linkId,
    sourceNodeId: operation.payload.sourceId,
    targetNodeId: operation.payload.targetId,
  });
  document.connections = normalizeConnections(document.connections);
}

function applyLinkUpdate(document, operation) {
  document.connections = normalizeConnections(document.connections);
  const index = document.connections.findIndex((connection) => connection.id === operation.payload.linkId);
  if (index === -1) {
    throw new CoeditingDocumentError(
      'COEDITING_LINK_NOT_FOUND',
      `Link "${operation.payload.linkId}" was not found`,
      { linkId: operation.payload.linkId }
    );
  }

  const current = document.connections[index];
  const changes = isPlainObject(operation.payload.changes)
    ? structuredClone(operation.payload.changes)
    : null;

  if (!changes) {
    throw new CoeditingDocumentError(
      'COEDITING_INVALID_LINK_CHANGES',
      'payload.changes must be an object'
    );
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'id') && changes.id !== operation.payload.linkId) {
    throw new CoeditingDocumentError(
      'COEDITING_UNSUPPORTED_LINK_CHANGE',
      'Link id cannot be changed',
      { field: 'id' }
    );
  }

  const nextConnection = {
    ...current,
    ...changes,
    id: operation.payload.linkId,
    sourceNodeId: changes.sourceNodeId || changes.sourceId || current.sourceNodeId,
    targetNodeId: changes.targetNodeId || changes.targetId || current.targetNodeId,
  };

  validateLinkEndpoints(document, nextConnection.sourceNodeId, nextConnection.targetNodeId);
  document.connections[index] = nextConnection;
  document.connections = normalizeConnections(document.connections);
}

function applyLinkDelete(document, operation) {
  document.connections = normalizeConnections(document.connections);
  const index = document.connections.findIndex((connection) => connection.id === operation.payload.linkId);
  if (index === -1) {
    throw new CoeditingDocumentError(
      'COEDITING_LINK_NOT_FOUND',
      `Link "${operation.payload.linkId}" was not found`,
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
    throw new CoeditingDocumentError(
      'COEDITING_INVALID_METADATA',
      'payload.changes must be an object'
    );
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'name')) {
    document.name = typeof changes.name === 'string' && changes.name.trim()
      ? changes.name
      : 'Untitled Map';
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'notes')) {
    document.notes = changes.notes ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'colors')) {
    if (!Array.isArray(changes.colors)) {
      throw new CoeditingDocumentError(
        'COEDITING_INVALID_METADATA',
        'colors must be an array',
        { field: 'colors' }
      );
    }
    document.colors = structuredClone(changes.colors);
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'connectionColors')) {
    if (!isPlainObject(changes.connectionColors)) {
      throw new CoeditingDocumentError(
        'COEDITING_INVALID_METADATA',
        'connectionColors must be an object',
        { field: 'connectionColors' }
      );
    }
    document.connectionColors = structuredClone(changes.connectionColors);
  }
}

export function applyOperationToDocument(document, operation) {
  const nextDocument = normalizeLiveDocument(cloneDocument(document));

  switch (operation?.type) {
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
      throw new CoeditingDocumentError(
        'COEDITING_UNSUPPORTED_OPERATION',
        `Operation type "${operation?.type || ''}" is not supported`,
        { type: operation?.type || null }
      );
  }

  return nextDocument;
}

export function replayOperations(baseDocument, operations = []) {
  let nextDocument = normalizeLiveDocument(baseDocument);
  for (const operation of operations) {
    nextDocument = applyOperationToDocument(nextDocument, operation);
  }
  return nextDocument;
}

export { CoeditingDocumentError, normalizeLiveDocument, findNodeByIdInDocument };
