const ENVELOPE_FIELDS = Object.freeze([
  'opId',
  'mapId',
  'sessionId',
  'actorId',
  'baseVersion',
  'timestamp',
  'type',
  'payload',
]);

const OP_TYPES = Object.freeze({
  NODE_ADD: 'node.add',
  NODE_UPDATE: 'node.update',
  NODE_DELETE: 'node.delete',
  LINK_ADD: 'link.add',
  LINK_UPDATE: 'link.update',
  LINK_DELETE: 'link.delete',
  METADATA_UPDATE: 'metadata.update',
});

const ALLOWED_OP_TYPES = Object.freeze(Object.values(OP_TYPES));
const ALLOWED_OP_TYPE_SET = new Set(ALLOWED_OP_TYPES);

const OP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{6,120}$/;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class CoeditingContractError extends Error {
  constructor(details = []) {
    super('Invalid coediting operation envelope');
    this.name = 'CoeditingContractError';
    this.code = 'COEDITING_CONTRACT_INVALID';
    this.details = details;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pushError(errors, field, message) {
  errors.push({ field, message });
}

function ensureAllowedKeys(raw, allowedKeys, fieldPrefix, errors) {
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.includes(key)) {
      pushError(errors, `${fieldPrefix}.${key}`, 'Unknown field');
    }
  }
}

function normalizeUuid(raw, field, errors) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) {
    pushError(errors, field, 'Field is required');
    return null;
  }
  if (!UUID_PATTERN.test(value)) {
    pushError(errors, field, 'Must be a UUID');
    return null;
  }
  return value;
}

function normalizePatternedString(raw, field, pattern, errors, required = true) {
  if (raw === null || raw === undefined || raw === '') {
    if (required) pushError(errors, field, 'Field is required');
    return null;
  }

  const value = String(raw).trim();
  if (!value) {
    if (required) pushError(errors, field, 'Field is required');
    return null;
  }

  if (!pattern.test(value)) {
    pushError(errors, field, 'Invalid format');
    return null;
  }
  return value;
}

function normalizeNullableEntityId(raw, field, errors) {
  if (raw === null || raw === undefined || raw === '') return null;
  return normalizePatternedString(raw, field, ENTITY_ID_PATTERN, errors, false);
}

function normalizeBaseVersion(raw, errors) {
  if (raw === null || raw === undefined || raw === '') {
    pushError(errors, 'baseVersion', 'Field is required');
    return null;
  }

  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
  if (!Number.isInteger(parsed) || parsed < 0) {
    pushError(errors, 'baseVersion', 'Must be a non-negative integer');
    return null;
  }
  return parsed;
}

function normalizeTimestamp(raw, errors) {
  const value = String(raw || '').trim();
  if (!value) {
    pushError(errors, 'timestamp', 'Field is required');
    return null;
  }

  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) {
    pushError(errors, 'timestamp', 'Must be a valid ISO-8601 timestamp');
    return null;
  }

  return new Date(timestampMs).toISOString();
}

function normalizeChanges(raw, field, errors) {
  if (!isPlainObject(raw)) {
    pushError(errors, field, 'Must be an object');
    return null;
  }
  const keys = Object.keys(raw);
  if (keys.length === 0) {
    pushError(errors, field, 'Must include at least one field');
    return null;
  }
  return { ...raw };
}

function normalizeNodeAddPayload(payload, errors) {
  const allowed = ['nodeId', 'parentId', 'afterNodeId', 'node'];
  ensureAllowedKeys(payload, allowed, 'payload', errors);

  const nodeId = normalizePatternedString(payload.nodeId, 'payload.nodeId', ENTITY_ID_PATTERN, errors);
  const parentId = normalizeNullableEntityId(payload.parentId, 'payload.parentId', errors);
  const afterNodeId = normalizeNullableEntityId(payload.afterNodeId, 'payload.afterNodeId', errors);

  let node = null;
  if (!isPlainObject(payload.node)) {
    pushError(errors, 'payload.node', 'Must be an object');
  } else {
    node = { ...payload.node };
    if (Object.prototype.hasOwnProperty.call(node, 'id') && node.id !== null && node.id !== undefined) {
      const nestedNodeId = normalizePatternedString(
        node.id,
        'payload.node.id',
        ENTITY_ID_PATTERN,
        errors
      );
      if (nestedNodeId && nodeId && nestedNodeId !== nodeId) {
        pushError(errors, 'payload.node.id', 'Must match payload.nodeId');
      } else if (nestedNodeId) {
        node.id = nestedNodeId;
      }
    } else if (nodeId) {
      node.id = nodeId;
    }
  }

  return {
    nodeId,
    parentId,
    afterNodeId,
    node,
  };
}

function normalizeNodeUpdatePayload(payload, errors) {
  const allowed = ['nodeId', 'changes'];
  ensureAllowedKeys(payload, allowed, 'payload', errors);

  return {
    nodeId: normalizePatternedString(payload.nodeId, 'payload.nodeId', ENTITY_ID_PATTERN, errors),
    changes: normalizeChanges(payload.changes, 'payload.changes', errors),
  };
}

function normalizeNodeDeletePayload(payload, errors) {
  const allowed = ['nodeId'];
  ensureAllowedKeys(payload, allowed, 'payload', errors);

  return {
    nodeId: normalizePatternedString(payload.nodeId, 'payload.nodeId', ENTITY_ID_PATTERN, errors),
  };
}

function normalizeLinkAddPayload(payload, errors) {
  const allowed = ['linkId', 'sourceId', 'targetId', 'link'];
  ensureAllowedKeys(payload, allowed, 'payload', errors);

  const linkId = normalizePatternedString(payload.linkId, 'payload.linkId', ENTITY_ID_PATTERN, errors);
  const sourceId = normalizePatternedString(
    payload.sourceId,
    'payload.sourceId',
    ENTITY_ID_PATTERN,
    errors
  );
  const targetId = normalizePatternedString(
    payload.targetId,
    'payload.targetId',
    ENTITY_ID_PATTERN,
    errors
  );

  let link = null;
  if (payload.link !== undefined) {
    if (!isPlainObject(payload.link)) {
      pushError(errors, 'payload.link', 'Must be an object');
    } else {
      link = { ...payload.link };
      if (Object.prototype.hasOwnProperty.call(link, 'id') && link.id !== null && link.id !== undefined) {
        const nestedLinkId = normalizePatternedString(
          link.id,
          'payload.link.id',
          ENTITY_ID_PATTERN,
          errors
        );
        if (nestedLinkId && linkId && nestedLinkId !== linkId) {
          pushError(errors, 'payload.link.id', 'Must match payload.linkId');
        } else if (nestedLinkId) {
          link.id = nestedLinkId;
        }
      } else if (linkId) {
        link.id = linkId;
      }
    }
  }

  return {
    linkId,
    sourceId,
    targetId,
    link,
  };
}

function normalizeLinkUpdatePayload(payload, errors) {
  const allowed = ['linkId', 'changes'];
  ensureAllowedKeys(payload, allowed, 'payload', errors);

  return {
    linkId: normalizePatternedString(payload.linkId, 'payload.linkId', ENTITY_ID_PATTERN, errors),
    changes: normalizeChanges(payload.changes, 'payload.changes', errors),
  };
}

function normalizeLinkDeletePayload(payload, errors) {
  const allowed = ['linkId'];
  ensureAllowedKeys(payload, allowed, 'payload', errors);

  return {
    linkId: normalizePatternedString(payload.linkId, 'payload.linkId', ENTITY_ID_PATTERN, errors),
  };
}

function normalizeMetadataUpdatePayload(payload, errors) {
  const allowed = ['changes'];
  ensureAllowedKeys(payload, allowed, 'payload', errors);

  return {
    changes: normalizeChanges(payload.changes, 'payload.changes', errors),
  };
}

function normalizePayload(type, rawPayload, errors) {
  if (!isPlainObject(rawPayload)) {
    pushError(errors, 'payload', 'Must be an object');
    return null;
  }

  switch (type) {
    case OP_TYPES.NODE_ADD:
      return normalizeNodeAddPayload(rawPayload, errors);
    case OP_TYPES.NODE_UPDATE:
      return normalizeNodeUpdatePayload(rawPayload, errors);
    case OP_TYPES.NODE_DELETE:
      return normalizeNodeDeletePayload(rawPayload, errors);
    case OP_TYPES.LINK_ADD:
      return normalizeLinkAddPayload(rawPayload, errors);
    case OP_TYPES.LINK_UPDATE:
      return normalizeLinkUpdatePayload(rawPayload, errors);
    case OP_TYPES.LINK_DELETE:
      return normalizeLinkDeletePayload(rawPayload, errors);
    case OP_TYPES.METADATA_UPDATE:
      return normalizeMetadataUpdatePayload(rawPayload, errors);
    default:
      pushError(errors, 'type', 'Unsupported operation type');
      return null;
  }
}

function normalizeType(raw, errors) {
  const value = String(raw || '').trim();
  if (!value) {
    pushError(errors, 'type', 'Field is required');
    return null;
  }
  if (!ALLOWED_OP_TYPE_SET.has(value)) {
    pushError(errors, 'type', 'Unsupported operation type');
    return null;
  }
  return value;
}

function normalizeOperationEnvelope(rawEnvelope, options = {}) {
  const errors = [];

  if (!isPlainObject(rawEnvelope)) {
    throw new CoeditingContractError([{ field: 'operation', message: 'Must be an object' }]);
  }

  ensureAllowedKeys(rawEnvelope, ENVELOPE_FIELDS, 'operation', errors);

  const opId = normalizePatternedString(rawEnvelope.opId, 'opId', OP_ID_PATTERN, errors);
  const mapId = normalizeUuid(rawEnvelope.mapId, 'mapId', errors);
  const sessionId = normalizePatternedString(rawEnvelope.sessionId, 'sessionId', SESSION_ID_PATTERN, errors);
  const actorId = normalizeUuid(rawEnvelope.actorId, 'actorId', errors);
  const baseVersion = normalizeBaseVersion(rawEnvelope.baseVersion, errors);
  const timestamp = normalizeTimestamp(rawEnvelope.timestamp, errors);
  const type = normalizeType(rawEnvelope.type, errors);
  const payload = normalizePayload(type, rawEnvelope.payload, errors);

  if (options.expectedMapId) {
    const expectedMapId = String(options.expectedMapId).trim().toLowerCase();
    if (mapId && expectedMapId !== mapId) {
      pushError(errors, 'mapId', 'Must match route map id');
    }
  }

  if (options.expectedActorId) {
    const expectedActorId = String(options.expectedActorId).trim().toLowerCase();
    if (actorId && expectedActorId !== actorId) {
      pushError(errors, 'actorId', 'Must match authenticated user id');
    }
  }

  if (errors.length > 0) {
    throw new CoeditingContractError(errors);
  }

  return {
    opId,
    mapId,
    sessionId,
    actorId,
    baseVersion,
    timestamp,
    type,
    payload,
  };
}

module.exports = {
  ENVELOPE_FIELDS,
  OP_TYPES,
  ALLOWED_OP_TYPES,
  CoeditingContractError,
  normalizeOperationEnvelope,
};
