// Photos on the device, before upload. Every picture is decoded once with its EXIF orientation
// applied (createImageBitmap 'from-image'), so nothing is rotated twice, then shrunk to a working
// size for the cropper. The cropped result is a JPEG of at most 1600 px, usually 200–500 kB.

export const WORKING_SIZE = 2400
export const UPLOAD_SIZE = 1600

export interface PixelArea {
  x: number
  y: number
  width: number
  height: number
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    // Older WebViews: an <img> applies the orientation itself.
    const url = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.decoding = 'async'
      image.src = url
      await image.decode()
      return image
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function size(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height }
}

function toBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', quality),
  )
}

/** Upright, shrunk copy of a camera/gallery picture, for the cropper. */
export async function prepare(file: Blob): Promise<Blob> {
  const source = await decode(file)
  const { width, height } = size(source)
  if (!width || !height) throw new Error('empty image')
  const scale = Math.min(1, WORKING_SIZE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ('close' in source) source.close()
  return toBlob(canvas, 0.92)
}

/**
 * Cut `area` (in the coordinates react-easy-crop reports: the image rotated by `rotation`) out of
 * the prepared image and shrink it to UPLOAD_SIZE.
 */
export async function crop(prepared: Blob, area: PixelArea, rotation = 0): Promise<Blob> {
  const source = await decode(prepared)
  const { width, height } = size(source)
  const radians = (rotation * Math.PI) / 180
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))
  const rotatedWidth = Math.round(width * cos + height * sin)
  const rotatedHeight = Math.round(width * sin + height * cos)

  // Draw the whole image rotated, then copy the area out of it.
  const rotated = document.createElement('canvas')
  rotated.width = rotatedWidth
  rotated.height = rotatedHeight
  const context = rotated.getContext('2d')!
  context.translate(rotatedWidth / 2, rotatedHeight / 2)
  context.rotate(radians)
  context.drawImage(source, -width / 2, -height / 2)
  if ('close' in source) source.close()

  const scale = Math.min(1, UPLOAD_SIZE / Math.max(area.width, area.height))
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(area.width * scale))
  out.height = Math.max(1, Math.round(area.height * scale))
  const outContext = out.getContext('2d')!
  outContext.imageSmoothingQuality = 'high'
  outContext.drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, out.width, out.height)
  return toBlob(out, 0.85)
}

export interface Quality {
  dark: boolean
  blurry: boolean
}

/** Cheap checks on a small copy: too dark (mean brightness) or blurry (variance of the Laplacian). */
export async function checkQuality(blob: Blob): Promise<Quality> {
  const source = await decode(blob)
  const { width, height } = size(source)
  const scale = 256 / Math.max(width, height)
  const w = Math.max(8, Math.round(width * scale))
  const h = Math.max(8, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(source, 0, 0, w, h)
  if ('close' in source) source.close()
  const { data } = context.getImageData(0, 0, w, h)
  const gray = new Float32Array(w * h)
  let sum = 0
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
    sum += gray[i]
  }
  let lapSum = 0
  let lapSq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]
      lapSum += lap
      lapSq += lap * lap
      n++
    }
  }
  const variance = lapSq / n - (lapSum / n) ** 2
  return { dark: sum / (w * h) < 45, blurry: variance < 60 }
}

/** Grayscale, contrast-stretched, enlarged copy for OCR (text reads much better this way). */
export async function forOcr(blob: Blob): Promise<HTMLCanvasElement> {
  const source = await decode(blob)
  const { width, height } = size(source)
  const scale = Math.min(2.5, 1800 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.filter = 'grayscale(1) contrast(1.6)'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ('close' in source) source.close()
  return canvas
}
