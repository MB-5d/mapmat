#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const {
  OP_TYPES,
  normalizeOperationEnvelope,
  CoeditingContractError,
} = require('../utils/coeditingContract');

function expectInvalid(raw, expectedField, options = {}) {
  let thrown = null;
  try {
    normalizeOperationEnvelope(raw, options);
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof CoeditingContractError, 'Expected CoeditingContractError');
  assert(
    thrown.details.some((detail) => detail.field === expectedField),
    `Expected validation error for field "${expectedField}"`
  );
}

function main() {
  const validMapId = '11111111-1111-4111-8111-111111111111';
  const validActorId = '22222222-2222-4222-8222-222222222222';

  const normalized = normalizeOperationEnvelope(
    {
      opId: 'op-123456',
      mapId: validMapId,
      sessionId: 'session-abc123',
      actorId: validActorId,
      baseVersion: '12',
      timestamp: '2026-03-13T13:15:00-05:00',
      type: OP_TYPES.NODE_ADD,
      payload: {
        nodeId: 'node-1',
        parentId: null,
        afterNodeId: '',
        node: {
          title: 'Home',
        },
      },
    },
    {
      expectedMapId: validMapId,
      expectedActorId: validActorId,
    }
  );

  assert.strictEqual(normalized.opId, 'op-123456');
  assert.strictEqual(normalized.baseVersion, 12);
  assert.strictEqual(normalized.timestamp, '2026-03-13T18:15:00.000Z');
  assert.strictEqual(normalized.payload.nodeId, 'node-1');
  assert.strictEqual(normalized.payload.node.id, 'node-1');
  assert.strictEqual(normalized.payload.parentId, null);
  assert.strictEqual(normalized.payload.afterNodeId, null);

  expectInvalid(
    {
      opId: 'op-123456',
      mapId: validMapId,
      sessionId: 'session-abc123',
      actorId: validActorId,
      baseVersion: 0,
      timestamp: '2026-03-13T18:15:00.000Z',
      type: 'node.move',
      payload: {},
    },
    'type'
  );

  expectInvalid(
    {
      opId: 'op-123456',
      mapId: validMapId,
      sessionId: 'session-abc123',
      actorId: validActorId,
      baseVersion: 0,
      timestamp: '2026-03-13T18:15:00.000Z',
      type: OP_TYPES.NODE_UPDATE,
      payload: {
        nodeId: 'node-1',
        changes: {},
      },
    },
    'payload.changes'
  );

  expectInvalid(
    {
      opId: 'op-123456',
      mapId: validMapId,
      sessionId: 'session-abc123',
      actorId: validActorId,
      baseVersion: 0,
      timestamp: '2026-03-13T18:15:00.000Z',
      type: OP_TYPES.LINK_ADD,
      payload: {
        linkId: 'link-1',
        sourceId: 'node-1',
        targetId: 'node-2',
        extra: true,
      },
    },
    'payload.extra'
  );

  expectInvalid(
    {
      opId: 'op-123456',
      mapId: validMapId,
      sessionId: 'session-abc123',
      actorId: '33333333-3333-4333-8333-333333333333',
      baseVersion: 0,
      timestamp: '2026-03-13T18:15:00.000Z',
      type: OP_TYPES.METADATA_UPDATE,
      payload: {
        changes: { name: 'New Name' },
      },
    },
    'actorId',
    { expectedActorId: validActorId }
  );

  console.log('[coediting-contract] Passed. Contract envelope/type normalization is consistent.');
}

main();
