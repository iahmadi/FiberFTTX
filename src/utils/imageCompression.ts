// Client-side HTML5 Canvas image compression (max 1280px, JPEG 70%)
// Produces ~150-250KB JPEG Blobs suitable for IndexedDB caching and intranet upload.

export interface CompressedImageResult {
  blob: Blob;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  filename: string;
}

export async function compressImageForUpload(
  file: File,
  maxDimension = 1280,
  quality = 0.7,
): Promise<CompressedImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('فایل انتخاب‌شده یک تصویر معتبر نیست.');
  }

  const img = await loadImageElement(file);
  let targetWidth = img.naturalWidth || img.width;
  let targetHeight = img.naturalHeight || img.height;

  if (targetWidth > maxDimension || targetHeight > maxDimension) {
    if (targetWidth >= targetHeight) {
      targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
      targetWidth = maxDimension;
    } else {
      targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
      targetHeight = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, targetWidth);
  canvas.height = Math.max(1, targetHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('مرورگر از پردازش گرافیکی Canvas پشتیبانی نمی‌کند.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('فشرده‌سازی تصویر ناموفق بود.'));
      },
      'image/jpeg',
      quality,
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'evidence';
  return {
    blob,
    previewUrl: URL.createObjectURL(blob),
    originalSize: file.size,
    compressedSize: blob.size,
    width: canvas.width,
    height: canvas.height,
    filename: `${baseName}.jpg`,
  };
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const readerUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(readerUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(readerUrl);
      reject(new Error('خواندن فایل تصویر ناموفق بود.'));
    };
    img.src = readerUrl;
  });
}

export function formatBytesFa(bytes: number): string {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}
