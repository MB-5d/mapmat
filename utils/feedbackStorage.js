const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const railwayVolumeDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RAILWAY_VOLUME_PATH || null;
const FEEDBACK_PUBLIC_BASE = '/uploads/feedback';
const FEEDBACK_STORAGE_DIR = railwayVolumeDir
  ? path.join(railwayVolumeDir, 'uploads', 'feedback')
  : path.join(__dirname, '..', 'uploads', 'feedback');
const FEEDBACK_IMAGE_MAX_BYTES = Math.max(
  32 * 1024,
  Number(process.env.FEEDBACK_IMAGE_MAX_BYTES || 2 * 1024 * 1024)
);
const ALLOWED_FEEDBACK_MIME = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
});

if (!fs.existsSync(FEEDBACK_STORAGE_DIR)) {
  fs.mkdirSync(FEEDBACK_STORAGE_DIR, { recursive: true });
}

function ensureFeedbackStorageDir() {
  if (!fs.existsSync(FEEDBACK_STORAGE_DIR)) {
    fs.mkdirSync(FEEDBACK_STORAGE_DIR, { recursive: true });
  }
}

function parseFeedbackImageDataUrl(imageDataUrl) {
  const match = String(imageDataUrl || '').match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    const error = new Error('Upload a PNG, JPG, or WebP image.');
    error.status = 400;
    throw error;
  }

  const mimeType = String(match[1] || '').toLowerCase();
  const extension = ALLOWED_FEEDBACK_MIME[mimeType];
  if (!extension) {
    const error = new Error('Upload a PNG, JPG, or WebP image.');
    error.status = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) {
    const error = new Error('Feedback image was empty.');
    error.status = 400;
    throw error;
  }
  if (buffer.length > FEEDBACK_IMAGE_MAX_BYTES) {
    const error = new Error('Feedback image is too large.');
    error.status = 400;
    throw error;
  }

  return { buffer, extension };
}

function buildFeedbackPublicPath(filename) {
  return `${FEEDBACK_PUBLIC_BASE}/${filename}`;
}

async function saveFeedbackImageFromDataUrl({ feedbackId, imageDataUrl }) {
  ensureFeedbackStorageDir();
  const { buffer, extension } = parseFeedbackImageDataUrl(imageDataUrl);
  const filename = `feedback-${String(feedbackId || 'item')}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
  const absolutePath = path.join(FEEDBACK_STORAGE_DIR, filename);
  await fs.promises.writeFile(absolutePath, buffer);
  return buildFeedbackPublicPath(filename);
}

module.exports = {
  FEEDBACK_PUBLIC_BASE,
  FEEDBACK_STORAGE_DIR,
  saveFeedbackImageFromDataUrl,
};
