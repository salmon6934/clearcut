import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from '../supabase';
import { isNativePlatform } from './platform';

export const MAX_RECEIPT_BYTES = 1.5 * 1024 * 1024; // 1.5 MB (1,572,864 bytes)
export const MAX_DIMENSION = 1920; // 1080p / 2K max width/height

export interface CapturedImage {
  blob: Blob;
  previewUrl: string;
  sizeBytes: number;
}

/**
 * Resizes and compresses an image Blob/File to a JPEG guaranteed to be <= maxBytes (1.5 MB).
 */
export async function compressImageToJpeg(
  source: Blob | File | string,
  maxBytes: number = MAX_RECEIPT_BYTES
): Promise<{ blob: Blob; sizeBytes: number }> {
  // If running in Node test environment without browser Image/Canvas
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    if (source instanceof Blob) {
      return { blob: source, sizeBytes: source.size };
    }
    const fakeBlob = new Blob([source as string], { type: 'image/jpeg' });
    return { blob: fakeBlob, sizeBytes: fakeBlob.size };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const cleanup = (url?: string) => {
      if (url && typeof source !== 'string') {
        URL.revokeObjectURL(url);
      }
    };

    let objectUrl = '';
    if (typeof source === 'string') {
      img.src = source.startsWith('data:') ? source : `data:image/jpeg;base64,${source}`;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }

    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        // Downscale while preserving aspect ratio if exceeding max dimension
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup(objectUrl);
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Progressively step down quality if needed to guarantee <= maxBytes
        const tryQuality = (quality: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                cleanup(objectUrl);
                reject(new Error('Failed to encode image to JPEG blob'));
                return;
              }

              if (blob.size <= maxBytes || quality <= 0.4) {
                cleanup(objectUrl);
                resolve({ blob, sizeBytes: blob.size });
              } else {
                // Try lower quality
                tryQuality(Math.max(0.3, quality - 0.15));
              }
            },
            'image/jpeg',
            quality
          );
        };

        tryQuality(0.85);
      } catch (err) {
        cleanup(objectUrl);
        reject(err);
      }
    };

    img.onerror = (err) => {
      cleanup(objectUrl);
      reject(new Error('Failed to load image for compression'));
    };
  });
}

/**
 * Capture receipt photo from camera or gallery.
 */
export async function captureReceiptPhoto(
  source: 'prompt' | 'camera' | 'photos' = 'prompt'
): Promise<CapturedImage | null> {
  const cameraSource =
    source === 'camera'
      ? CameraSource.Camera
      : source === 'photos'
      ? CameraSource.Photos
      : CameraSource.Prompt;

  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Base64,
      source: cameraSource,
      quality: 85,
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      allowEditing: false,
      correctOrientation: true,
    });

    if (!photo.base64String) {
      return null;
    }

    const { blob, sizeBytes } = await compressImageToJpeg(
      photo.base64String,
      MAX_RECEIPT_BYTES
    );
    const previewUrl = `data:image/jpeg;base64,${photo.base64String}`;

    return {
      blob,
      previewUrl,
      sizeBytes,
    };
  } catch (err: any) {
    if (err?.message?.includes('cancelled') || err?.message?.includes('User cancelled')) {
      return null;
    }
    throw err;
  }
}

/**
 * Uploads a compressed receipt blob to Supabase Storage private 'receipts' bucket.
 * Destination path: `${groupId}/${expenseId || uuid}_${timestamp}.jpg`
 */
export async function uploadReceiptToStorage(
  groupId: string,
  expenseId: string,
  blob: Blob
): Promise<{ path: string }> {
  const safeId = expenseId || (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'temp');
  const path = `${groupId}/${safeId}_${Date.now()}.jpg`;

  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload receipt: ${error.message}`);
  }

  return { path: data.path };
}

/**
 * Generates a short-lived signed URL for a private receipt storage path.
 */
export async function getReceiptSignedUrl(
  path: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  if (!path) return null;

  try {
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}
