#!/usr/bin/env node

/* eslint-disable no-console */

const policy = require('../policies/permissionPolicy');

const roleValues = Object.values(policy.ROLES);
const actionValues = Object.values(policy.ACTIONS);
const featureValues = Object.values(policy.FEATURES);

let hasError = false;

for (const action of actionValues) {
  const roles = policy.ACTION_ROLE_MATRIX[action];
  if (!Array.isArray(roles) || roles.length === 0) {
    hasError = true;
    console.error(`[permission-policy] Missing role mapping for action: ${action}`);
    continue;
  }

  const invalidRoles = roles.filter((role) => !roleValues.includes(role));
  if (invalidRoles.length > 0) {
    hasError = true;
    console.error(`[permission-policy] Action "${action}" has invalid roles: ${invalidRoles.join(', ')}`);
  }
}

for (const action of Object.keys(policy.ACTION_ROLE_MATRIX)) {
  if (!actionValues.includes(action)) {
    hasError = true;
    console.error(`[permission-policy] Matrix contains unknown action key: ${action}`);
  }
}

for (const feature of featureValues) {
  const mappedAction = policy.FEATURE_ACTION_MAP[feature];
  if (!mappedAction) {
    hasError = true;
    console.error(`[permission-policy] Missing action mapping for feature: ${feature}`);
    continue;
  }
  if (!actionValues.includes(mappedAction)) {
    hasError = true;
    console.error(
      `[permission-policy] Feature "${feature}" maps to unknown action: ${mappedAction}`
    );
  }
}

const publicRoles = policy.ACTION_ROLE_MATRIX[policy.ACTIONS.SHARE_READ_PUBLIC] || [];
if (!publicRoles.includes(policy.ROLES.ANONYMOUS)) {
  hasError = true;
  console.error('[permission-policy] share.readPublic must include anonymous role.');
}

const activityRoles = policy.ACTION_ROLE_MATRIX[policy.ACTIONS.MAP_ACTIVITY_LIST] || [];
for (const requiredRole of [
  policy.ROLES.OWNER,
  policy.ROLES.EDITOR,
  policy.ROLES.COMMENTER,
  policy.ROLES.VIEWER,
]) {
  if (!activityRoles.includes(requiredRole)) {
    hasError = true;
    console.error(`[permission-policy] mapActivity.list must include ${requiredRole}.`);
  }
}

const ownerCanDoEverything = actionValues.every((action) => policy.can(action, policy.ROLES.OWNER));
if (!ownerCanDoEverything) {
  hasError = true;
  console.error('[permission-policy] Owner role must be allowed for all actions.');
}

const membershipOwnerRole = policy.resolveResourceRole({
  actorUserId: 'user-2',
  resourceOwnerUserId: 'user-1',
  membershipRole: policy.ROLES.OWNER,
});
if (membershipOwnerRole !== policy.ROLES.OWNER) {
  hasError = true;
  console.error('[permission-policy] Owner membership role must resolve to owner.');
}

if (hasError) {
  process.exit(1);
}

console.log('[permission-policy] Passed. Permission matrix is internally consistent.');
