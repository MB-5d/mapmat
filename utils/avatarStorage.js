const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const railwayVolumeDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RAILWAY_VOLUME_PATH || null;
const AVATAR_PUBLIC_BASE = '/uploads/avatars';
const AVATAR_STORAGE_DIR = railwayVolumeDir
  ? path.join(railwayVolumeDir, 'uploads', 'avatars')
  : path.join(__dirname, '..', 'uploads', 'avatars');
const AVATAR_MAX_BYTES = Math.max(
  32 * 1024,
  Number(process.env.AVATAR_MAX_BYTES || 512 * 1024)
);
const ALLOWED_AVATAR_MIME = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
});

if (!fs.existsSync(AVATAR_STORAGE_DIR)) {
  fs.mkdirSync(AVATAR_STORAGE_DIR, { recursive: true });
}

function ensureAvatarStorageDir() {
  if (!fs.existsSync(AVATAR_STORAGE_DIR)) {
    fs.mkdirSync(AVATAR_STORAGE_DIR, { recursive: true });
  }
}

function parseAvatarDataUrl(imageDataUrl) {
  const match = String(imageDataUrl || '').match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    const error = new Error('Upload a PNG, JPG, or WebP image.');
    error.status = 400;
    throw error;
  }

  const mimeType = String(match[1] || '').toLowerCase();
  const extension = ALLOWED_AVATAR_MIME[mimeType];
  if (!extension) {
    const error = new Error('Upload a PNG, JPG, or WebP image.');
    error.status = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) {
    const error = new Error('Avatar upload was empty.');
    error.status = 400;
    throw error;
  }
  if (buffer.length > AVATAR_MAX_BYTES) {
    const error = new Error('Avatar image is too large.');
    error.status = 400;
    throw error;
  }

  return { buffer, extension };
}

function buildAvatarPublicPath(filename) {
  return `${AVATAR_PUBLIC_BASE}/${filename}`;
}

function avatarPublicPathToAbsolute(publicPath) {
  const filename = path.basename(String(publicPath || ''));
  if (!filename) return null;
  return path.join(AVATAR_STORAGE_DIR, filename);
}

async function saveAvatarFromDataUrl({ userId, imageDataUrl }) {
  ensureAvatarStorageDir();
  const { buffer, extension } = parseAvatarDataUrl(imageDataUrl);
  const filename = `avatar-${String(userId || 'user')}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
  const absolutePath = path.join(AVATAR_STORAGE_DIR, filename);
  await fs.promises.writeFile(absolutePath, buffer);
  return buildAvatarPublicPath(filename);
}

async function removeAvatarFile(publicPath) {
  const absolutePath = avatarPublicPathToAbsolute(publicPath);
  if (!absolutePath) return;
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

module.exports = {
  AVATAR_PUBLIC_BASE,
  AVATAR_STORAGE_DIR,
  saveAvatarFromDataUrl,
  removeAvatarFile,
};
