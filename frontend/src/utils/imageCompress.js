import { getExifOrientation, rotateCanvasByExif } from './imageDetection'

/**
 * Resize + auto-crop + JPEG-compress an image client-side using Canvas API.
 *
 * Process:
 * 1. Fix EXIF orientation (auto-rotate based on device orientation)
 * 2. Resize to max 1600px in any dimension
 * 3. If image is > 720px in any dimension, auto-crop to 4:3 aspect ratio (portrait-friendly)
 * 4. Compress to 0.82 quality JPEG
 *
 * Returns a Blob (image/jpeg).
 */
export async function compressImage(file, maxDim = 1600, cropDim = 720, targetRatio = 4 / 3, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = async (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = async () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        // Step 0: Fix EXIF orientation
        const exifOrientation = await getExifOrientation(file);
        if ([6, 8].includes(exifOrientation)) {
          [w, h] = [h, w]; // Swap dimensions for 90° rotations
        }

        // Step 1: Resize to max dimension
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else        { w = Math.round(w * maxDim / h); h = maxDim; }
        }

        let canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Apply EXIF rotation
        canvas = rotateCanvasByExif(canvas, exifOrientation);

        // Step 2: Auto-crop if larger than 720px in any dimension
        let finalCanvas = canvas;
        if (w > cropDim || h > cropDim) {
          const srcRatio = w / h;
          let cropW = w;
          let cropH = h;
          let offsetX = 0;
          let offsetY = 0;

          if (srcRatio > targetRatio) {
            // Too wide, crop horizontally
            cropW = Math.round(h * targetRatio);
            offsetX = Math.round((w - cropW) / 2);
          } else {
            // Too tall, crop vertically
            cropH = Math.round(w / targetRatio);
            offsetY = Math.round((h - cropH) / 2);
          }

          // Create cropped canvas
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cropW;
          cropCanvas.height = cropH;
          const cropCtx = cropCanvas.getContext('2d');
          cropCtx.drawImage(canvas, offsetX, offsetY, cropW, cropH, 0, 0, cropW, cropH);
          finalCanvas = cropCanvas;
        }

        // Step 3: Compress to JPEG
        finalCanvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
          'image/jpeg',
          quality,
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
