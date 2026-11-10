const { createPrivateScanCaptureStore, PRIVATE_CAPTURE_KEY } = require('./privateScanCapture');
const { saveScreenshotObject, readScreenshotObject } = require('./screenshotStorage');
const imageAssets = require('../stores/imageAssetStore');
const policy = require('../policies/permissionPolicy');
let store;
function getPrivateCaptureStore() {
  if (!store) store = createPrivateScanCaptureStore({ encryptionKey: process.env.PRIVATE_SCAN_CAPTURE_KEY, saveObject: saveScreenshotObject, readObject: readScreenshotObject });
  return store;
}
function canReadBinding(userId, row) {
  const role = policy.resolveResourceRole({ actorUserId: userId, resourceOwnerUserId: row.map_owner_id, membershipRole: row.membership_role || null });
  return policy.can(policy.ACTIONS.MAP_READ, role);
}
async function resolvePrivateMapAccess(userId, key) {
  const rows = await imageAssets.listPrivateImageAccessAsync([key], userId);
  const binding = rows.find(row => canReadBinding(userId, row));
  return binding ? { mapId: binding.map_id, ownerUserId: binding.owner_user_id } : null;
}
// The encryption scope remains immutable; a permitted copy has its own access
// reference, even after the source map or its membership is removed.
async function readPrivateImageForMap(key, mapId) {
  const binding = await imageAssets.getPrivateImageBindingAsync(key, mapId);
  if (!binding) return null;
  return getPrivateCaptureStore().read({ ownerKey: 'user:' + binding.owner_user_id, mapId: binding.map_id, key });
}
function privateImageKeys(root, orphans) {
  const keys = new Set();
  const pending = [root, ...(Array.isArray(orphans) ? orphans : [])];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') continue;
    for (const field of ['thumbnailUrl', 'thumbnailFullUrl', 'fullScreenshotUrl']) {
      const url = String(node[field] || '');
      if (!url.startsWith('/api/private-scan-captures/')) continue;
      const key = url.slice('/api/private-scan-captures/'.length);
      if (!PRIVATE_CAPTURE_KEY.test(key)) throw Object.assign(Error('A private image reference is invalid.'), { status: 400, code: 'private_image_access' });
      keys.add(key);
    }
    if (Array.isArray(node.children)) pending.push(...node.children);
  }
  return [...keys];
}
async function saveMapWithPrivateImages({ userId, mapId, root, orphans, save }) {
  const storageKeys = privateImageKeys(root, orphans);
  if (!storageKeys.length) return save();
  const rows = await imageAssets.listPrivateImageAccessAsync(storageKeys, userId);
  const allowed = new Set(rows.filter(row => canReadBinding(userId, row)).map(row => row.storage_key));
  if (storageKeys.some(key => !allowed.has(key))) throw Object.assign(Error('You no longer have access to an image in this map. Reload the original map before copying it.'), { status: 403, code: 'private_image_access' });
  return imageAssets.saveWithPrivateImageReferencesAsync({ storageKeys, mapId, save });
}
module.exports = { getPrivateCaptureStore, resolvePrivateMapAccess, readPrivateImageForMap, privateImageKeys, saveMapWithPrivateImages };
