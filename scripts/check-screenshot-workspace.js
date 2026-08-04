const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assertScreenshotWorkspaceCapacity,
  createScreenshotWorkspace,
  normalizeScreenshotStorageError,
  removeScreenshotWorkspace,
} = require('../utils/screenshotWorkspace');

async function run() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vellic-workspace-check-'));
  try {
    const localDirectory = path.join(root, 'local');
    await fs.promises.mkdir(localDirectory);
    const local = await createScreenshotWorkspace({
      provider: 'local',
      localDirectory,
      temporaryDirectory: root,
    });
    assert.strictEqual(local.directory, localDirectory);
    assert.strictEqual(local.transient, false);

    const transient = await createScreenshotWorkspace({
      provider: 'r2',
      localDirectory,
      temporaryDirectory: root,
    });
    assert.strictEqual(transient.transient, true);
    const generatedFile = path.join(transient.directory, 'capture.jpg');
    await fs.promises.writeFile(generatedFile, Buffer.alloc(1024));
    await removeScreenshotWorkspace(transient);
    assert.strictEqual(fs.existsSync(transient.directory), false);

    for (const outcome of ['failure', 'cancellation']) {
      const interrupted = await createScreenshotWorkspace({
        provider: 'r2',
        localDirectory,
        temporaryDirectory: root,
      });
      try {
        await fs.promises.writeFile(
          path.join(interrupted.directory, `${outcome}.jpg`),
          Buffer.alloc(1024)
        );
        throw new Error(`simulated ${outcome}`);
      } catch (error) {
        assert.match(error.message, new RegExp(outcome));
      } finally {
        await removeScreenshotWorkspace(interrupted);
      }
      assert.strictEqual(
        fs.existsSync(interrupted.directory),
        false,
        `${outcome} workspace should be removed`
      );
    }

    await assert.rejects(
      () => assertScreenshotWorkspaceCapacity(localDirectory, {
        minimumFreeBytes: 1024,
        statfs: async () => ({ bsize: 1, bavail: 10 }),
      }),
      (error) => error?.code === 'storage_exhausted'
    );

    const originalMinimum = process.env.SCREENSHOT_MIN_FREE_BYTES;
    const beforePreflightFailure = new Set(await fs.promises.readdir(root));
    process.env.SCREENSHOT_MIN_FREE_BYTES = String(Number.MAX_SAFE_INTEGER);
    try {
      await assert.rejects(
        () => createScreenshotWorkspace({
          provider: 'r2',
          localDirectory,
          temporaryDirectory: root,
        }),
        (error) => error?.code === 'storage_exhausted'
      );
    } finally {
      if (originalMinimum === undefined) delete process.env.SCREENSHOT_MIN_FREE_BYTES;
      else process.env.SCREENSHOT_MIN_FREE_BYTES = originalMinimum;
    }
    assert.deepStrictEqual(
      new Set(await fs.promises.readdir(root)),
      beforePreflightFailure,
      'failed disk preflight must not leave a temporary workspace'
    );

    const normalized = normalizeScreenshotStorageError(
      Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
    );
    assert.strictEqual(normalized.code, 'storage_exhausted');
    assert.match(normalized.message, /temporarily full/i);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
  console.log('Screenshot workspace check passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
