export interface ProcessedImage {
  blob: Blob;
  base64: string;
  thumbnailBase64: string;
  width: number;
  height: number;
  size: number;
  mimeType: string;
}

/**
 * Downscale and compress image client-side to ensure rapid transmission over P2P/Relay
 */
export async function processImageFile(
  file: File | Blob, 
  maxWidth: number = 1600, 
  maxHeight: number = 1600, 
  quality: number = 0.8
): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;

      img.onload = () => {
        let { width, height } = img;

        // Maintain aspect ratio
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        // Draw downscaled image to canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Generate full-size compressed JPEG/WebP
        const mimeType = 'image/jpeg';
        canvas.toBlob(
          async (compressedBlob) => {
            if (!compressedBlob) {
              reject(new Error('Image compression failed'));
              return;
            }

            // Generate small 120px micro-thumbnail for instant preview
            const thumbCanvas = document.createElement('canvas');
            const thumbRatio = Math.min(120 / width, 120 / height);
            thumbCanvas.width = Math.max(1, Math.round(width * thumbRatio));
            thumbCanvas.height = Math.max(1, Math.round(height * thumbRatio));
            const thumbCtx = thumbCanvas.getContext('2d');
            
            let thumbnailBase64 = '';
            if (thumbCtx) {
              thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
              thumbnailBase64 = thumbCanvas.toDataURL('image/jpeg', 0.6);
            }

            const base64DataUrl = canvas.toDataURL(mimeType, quality);
            const base64Raw = base64DataUrl.split(',')[1] || base64DataUrl;

            resolve({
              blob: compressedBlob,
              base64: base64Raw,
              thumbnailBase64,
              width,
              height,
              size: compressedBlob.size,
              mimeType,
            });
          },
          mimeType,
          quality
        );
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Handle clipboard paste events to extract images on Windows Desktop (Ctrl+V)
 */
export function extractImageFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      return items[i].getAsFile();
    }
  }
  return null;
}

/**
 * Format bytes to readable string (e.g. 1.2 MB or 340 KB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
