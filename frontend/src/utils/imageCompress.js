import { getExifOrientation, rotateCanvasByExif } from './imageExif'

// Portrait 9:16 — bottles/cans/glasses are taller than wide.
export const DEFAULT_TARGET_RATIO = 9 / 16   // width / height
const DEFAULT_MAX_DIM = 1600
const DEFAULT_CROP_DIM = 720
const DEFAULT_QUALITY = 0.82

/**
 * Load a File/Blob into a canvas: EXIF-rotated (when autoEnhance) and resized
 * so neither side exceeds maxDim. Does NOT crop — that's a separate step so the
 * crop can be positioned using object detection.
 */
export async function loadOrientedCanvas(file, { maxDim = DEFAULT_MAX_DIM, autoEnhance = true } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = async (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = async () => {
        let w = img.naturalWidth
        let h = img.naturalHeight

        const exifOrientation = autoEnhance ? await getExifOrientation(file) : 1
        if ([6, 8].includes(exifOrientation)) [w, h] = [h, w] // 90° swaps dims

        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim }
          else        { w = Math.round(w * maxDim / h); h = maxDim }
        }

        let canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas = rotateCanvasByExif(canvas, exifOrientation)
        resolve(canvas)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Crop a canvas to a target aspect ratio, centered on a focal point.
 *
 * @param canvas       source canvas
 * @param targetRatio  desired width / height (default 9:16 portrait)
 * @param focus        { cx, cy } normalized 0..1 focal centre (default image centre)
 * @param cropDim      skip cropping if both sides ≤ this (default 720)
 */
export function cropToAspect(canvas, {
  targetRatio = DEFAULT_TARGET_RATIO,
  focus = { cx: 0.5, cy: 0.5 },
  cropDim = DEFAULT_CROP_DIM,
} = {}) {
  const w = canvas.width
  const h = canvas.height

  // Only crop large images, per "crop if above 720p"
  if (w <= cropDim && h <= cropDim) return canvas

  const srcRatio = w / h
  let cropW = w
  let cropH = h

  if (srcRatio > targetRatio) {
    // Source is wider than target → trim the sides (keep full height)
    cropW = Math.round(h * targetRatio)
  } else {
    // Source is taller than target → trim top/bottom (keep full width)
    cropH = Math.round(w / targetRatio)
  }

  // Position the crop window centred on the focal point, clamped to bounds
  const cx = (focus?.cx ?? 0.5) * w
  const cy = (focus?.cy ?? 0.5) * h
  const offsetX = Math.max(0, Math.min(w - cropW, Math.round(cx - cropW / 2)))
  const offsetY = Math.max(0, Math.min(h - cropH, Math.round(cy - cropH / 2)))

  const out = document.createElement('canvas')
  out.width = cropW
  out.height = cropH
  out.getContext('2d').drawImage(canvas, offsetX, offsetY, cropW, cropH, 0, 0, cropW, cropH)
  return out
}

/** Encode a canvas to a JPEG Blob. */
export function canvasToBlob(canvas, quality = DEFAULT_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
      'image/jpeg',
      quality,
    )
  })
}

/**
 * Convenience one-shot: orient + resize + (optional) centre-crop to 9:16 + encode.
 * For object-aware cropping, use loadOrientedCanvas + cropToAspect(focus) directly.
 */
export async function compressImage(file, opts = {}) {
  const {
    maxDim = DEFAULT_MAX_DIM,
    cropDim = DEFAULT_CROP_DIM,
    targetRatio = DEFAULT_TARGET_RATIO,
    quality = DEFAULT_QUALITY,
    autoEnhance = true,
  } = opts

  const base = await loadOrientedCanvas(file, { maxDim, autoEnhance })
  const final = autoEnhance ? cropToAspect(base, { targetRatio, cropDim }) : base
  return canvasToBlob(final, quality)
}
