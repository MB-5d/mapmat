const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_SCREENSHOT_MIN_FREE_BYTES = 64 * 1024 * 1024;

function getMinimumFreeBytes() {
  const configured = Number(process.env.SCREENSHOT_MIN_FREE_BYTES);
  if (!Number.isFinite(configured)) return DEFAULT_SCREENSHOT_MIN_FREE_BYTES;
  return Math.max(0, Math.floor(configured));
}

function createStorageExhaustedError(cause = null) {
  const error = new Error('Screenshot storage is temporarily full. Please retry after the worker recovers.');
  error.code = 'storage_exhausted';
  if (cause) error.cause = cause;
  return error;
}

function normalizeScreenshotStorageError(error) {
  if (!error) return error;
  const code = String(error.code || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();
  if (
    code === 'storage_exhausted'
    || code === 'enospc'
    || message.includes('no space left on device')
  ) {
    return createStorageExhaustedError(error);
  }
  return error;
}

async function assertScreenshotWorkspaceCapacity(
  directory,
  {
    minimumFreeBytes = getMinimumFreeBytes(),
    statfs = fs.promises.statfs?.bind(fs.promises),
  } = {}
) {
  if (!statfs || minimumFreeBytes <= 0) return null;
  let stats;
  try {
    stats = await statfs(directory);
  } catch {
    return null;
  }
  const blockSize = Number(stats?.bsize || stats?.frsize || 0);
  const availableBlocks = Number(stats?.bavail ?? stats?.bfree ?? 0);
  const availableBytes = blockSize * availableBlocks;
  if (Number.isFinite(availableBytes) && availableBytes < minimumFreeBytes) {
    throw createStorageExhaustedError();
  }
  return Number.isFinite(availableBytes) ? availableBytes : null;
}

async function createScreenshotWorkspace({
  provider,
  localDirectory,
  temporaryDirectory = os.tmpdir(),
} = {}) {
  if (provider !== 'r2') {
    await assertScreenshotWorkspaceCapacity(localDirectory);
    return {
      directory: localDirectory,
      transient: false,
    };
  }

  let directory = null;
  try {
    directory = await fs.promises.mkdtemp(path.join(temporaryDirectory, 'vellic-capture-'));
    await assertScreenshotWorkspaceCapacity(directory);
    return {
      directory,
      transient: true,
    };
  } catch (error) {
    if (directory) {
      await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
    throw normalizeScreenshotStorageError(error);
  }
}

async function removeScreenshotWorkspace(workspace) {
  if (!workspace?.transient || !workspace.directory) return;
  await fs.promises.rm(workspace.directory, { recursive: true, force: true });
}

module.exports = {
  DEFAULT_SCREENSHOT_MIN_FREE_BYTES,
  assertScreenshotWorkspaceCapacity,
  createScreenshotWorkspace,
  createStorageExhaustedError,
  normalizeScreenshotStorageError,
  removeScreenshotWorkspace,
};
