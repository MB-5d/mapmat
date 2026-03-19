const collaborationActivityStore = require('../stores/collaborationActivityStore');

const ACTIVITY_SCOPES = Object.freeze({
  COLLABORATION: 'collaboration',
  CONTENT: 'content',
  COMMENT: 'comment',
  VERSION: 'version',
});

const ACTIVITY_TYPES = Object.freeze({
  COLLAB_SETTINGS_UPDATED: 'collab.settings.updated',
  COLLAB_INVITE_CREATED: 'collab.invite.created',
  COLLAB_INVITE_ACCEPTED: 'collab.invite.accepted',
  COLLAB_INVITE_REVOKED: 'collab.invite.revoked',
  COLLAB_MEMBERSHIP_ROLE_CHANGED: 'collab.membership.role_changed',
  COLLAB_MEMBERSHIP_REMOVED: 'collab.membership.removed',
  COLLAB_ACCESS_REQUEST_CREATED: 'collab.access_request.created',
  COLLAB_ACCESS_REQUEST_APPROVED: 'collab.access_request.approved',
  COLLAB_ACCESS_REQUEST_DENIED: 'collab.access_request.denied',
  COMMENT_CREATED: 'comment.created',
  COMMENT_UPDATED: 'comment.updated',
  COMMENT_RESOLVED: 'comment.resolved',
  COMMENT_REOPENED: 'comment.reopened',
  COMMENT_DELETED: 'comment.deleted',
  VERSION_SAVED: 'map.version.saved',
  CONTENT_METADATA_UPDATED: 'content.metadata.updated',
  CONTENT_NODE_ADDED: 'content.node.added',
  CONTENT_NODE_UPDATED: 'content.node.updated',
  CONTENT_NODE_DELETED: 'content.node.deleted',
  CONTENT_LINK_ADDED: 'content.link.added',
  CONTENT_LINK_UPDATED: 'content.link.updated',
  CONTENT_LINK_DELETED: 'content.link.deleted',
});

function parsePayloadSafe(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function trimText(value, maxLength = 120) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function serializeActivityEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    mapId: row.map_id,
    eventType: row.event_type,
    eventScope: row.event_scope,
    entityType: row.entity_type || null,
    entityId: row.entity_id || null,
    summary: row.summary || null,
    payload: parsePayloadSafe(row.payload),
    actor: {
      userId: row.actor_user_id || null,
      role: row.actor_role || null,
      name: row.actor_name || null,
      email: row.actor_email || null,
    },
    createdAt: row.created_at,
  };
}

async function ensureCollaborationActivitySchemaAsync() {
  return collaborationActivityStore.ensureActivitySchemaAsync();
}

async function recordMapActivityAsync(activity) {
  return collaborationActivityStore.appendActivityEventAsync(activity);
}

async function recordMapActivityBestEffortAsync(activity, { label = '' } = {}) {
  try {
    return await recordMapActivityAsync(activity);
  } catch (error) {
    console.error(
      `Record map activity error${label ? ` (${label})` : ''}:`,
      error
    );
    return null;
  }
}

function buildCoeditingOperationActivity({ operation, actorRole = null }) {
  if (!operation?.mapId || !operation?.type) return null;

  const basePayload = {
    operationType: operation.type,
    opId: operation.opId || null,
    baseVersion: Number.isInteger(operation.baseVersion) ? operation.baseVersion : null,
    version: Number.isInteger(operation.version) ? operation.version : null,
    committedAt: operation.committedAt || null,
    timestamp: operation.timestamp || null,
    sessionId: operation.sessionId || null,
  };

  const activity = {
    mapId: operation.mapId,
    actorUserId: operation.actorId || null,
    actorRole,
    eventScope: ACTIVITY_SCOPES.CONTENT,
    entityType: null,
    entityId: null,
    summary: null,
    payload: basePayload,
    eventType: null,
  };

  switch (operation.type) {
    case 'metadata.update': {
      const changes = operation.payload?.changes || {};
      activity.eventType = ACTIVITY_TYPES.CONTENT_METADATA_UPDATED;
      activity.entityType = 'map';
      activity.entityId = operation.mapId;
      activity.payload = {
        ...basePayload,
        changedFields: Object.keys(changes),
        changes,
      };
      if (typeof changes.name === 'string' && trimText(changes.name, 80)) {
        activity.summary = `Renamed map to "${trimText(changes.name, 80)}"`;
      } else {
        activity.summary = 'Updated map metadata';
      }
      return activity;
    }
    case 'node.add': {
      const nodeTitle = trimText(operation.payload?.node?.title, 80);
      activity.eventType = ACTIVITY_TYPES.CONTENT_NODE_ADDED;
      activity.entityType = 'node';
      activity.entityId = operation.payload?.nodeId || null;
      activity.summary = nodeTitle ? `Added node "${nodeTitle}"` : 'Added node';
      activity.payload = {
        ...basePayload,
        nodeId: operation.payload?.nodeId || null,
        parentId: operation.payload?.parentId || null,
        afterNodeId: operation.payload?.afterNodeId || null,
        title: nodeTitle,
      };
      return activity;
    }
    case 'node.update': {
      const changes = operation.payload?.changes || {};
      const title = trimText(changes.title, 80);
      activity.eventType = ACTIVITY_TYPES.CONTENT_NODE_UPDATED;
      activity.entityType = 'node';
      activity.entityId = operation.payload?.nodeId || null;
      activity.summary = title ? `Renamed node to "${title}"` : 'Updated node';
      activity.payload = {
        ...basePayload,
        nodeId: operation.payload?.nodeId || null,
        changedFields: Object.keys(changes),
        changes,
      };
      return activity;
    }
    case 'node.delete':
      return {
        ...activity,
        eventType: ACTIVITY_TYPES.CONTENT_NODE_DELETED,
        entityType: 'node',
        entityId: operation.payload?.nodeId || null,
        summary: 'Deleted node',
        payload: {
          ...basePayload,
          nodeId: operation.payload?.nodeId || null,
        },
      };
    case 'link.add':
      return {
        ...activity,
        eventType: ACTIVITY_TYPES.CONTENT_LINK_ADDED,
        entityType: 'link',
        entityId: operation.payload?.linkId || null,
        summary: 'Added link',
        payload: {
          ...basePayload,
          linkId: operation.payload?.linkId || null,
          sourceId: operation.payload?.sourceId || null,
          targetId: operation.payload?.targetId || null,
        },
      };
    case 'link.update': {
      const changes = operation.payload?.changes || {};
      return {
        ...activity,
        eventType: ACTIVITY_TYPES.CONTENT_LINK_UPDATED,
        entityType: 'link',
        entityId: operation.payload?.linkId || null,
        summary: 'Updated link',
        payload: {
          ...basePayload,
          linkId: operation.payload?.linkId || null,
          changedFields: Object.keys(changes),
          changes,
        },
      };
    }
    case 'link.delete':
      return {
        ...activity,
        eventType: ACTIVITY_TYPES.CONTENT_LINK_DELETED,
        entityType: 'link',
        entityId: operation.payload?.linkId || null,
        summary: 'Deleted link',
        payload: {
          ...basePayload,
          linkId: operation.payload?.linkId || null,
        },
      };
    default:
      return null;
  }
}

module.exports = {
  ACTIVITY_SCOPES,
  ACTIVITY_TYPES,
  serializeActivityEvent,
  ensureCollaborationActivitySchemaAsync,
  recordMapActivityAsync,
  recordMapActivityBestEffortAsync,
  buildCoeditingOperationActivity,
};
