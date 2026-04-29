const AVATAR_OUTPUT_SIZE = 256;
const AVATAR_OUTPUT_QUALITY = 0.85;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load avatar image'));
    if (!String(src || '').startsWith('data:')) {
      image.crossOrigin = 'anonymous';
    }
    image.src = src;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to process avatar image'));
    reader.readAsDataURL(blob);
  });
}

function canvasToDataUrl(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) {
      resolve(canvas.toDataURL(mimeType, quality));
      return;
    }

    canvas.toBlob(async (blob) => {
      try {
        if (!blob) {
          if (mimeType !== 'image/png') {
            const fallback = await canvasToDataUrl(canvas, 'image/png');
            resolve(fallback);
            return;
          }
          reject(new Error('Failed to process avatar image'));
          return;
        }
        resolve(await blobToDataUrl(blob));
      } catch (error) {
        reject(error);
      }
    }, mimeType, quality);
  });
}

export async function createCroppedAvatarDataUrl(imageSrc, cropPixels) {
  if (!imageSrc || !cropPixels) {
    throw new Error('Choose and crop an avatar image first.');
  }

  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Avatar crop is not supported in this browser.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE
  );

  return canvasToDataUrl(canvas, 'image/webp', AVATAR_OUTPUT_QUALITY);
}

export { AVATAR_OUTPUT_SIZE };
