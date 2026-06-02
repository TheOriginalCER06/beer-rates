import piexif from 'piexifjs'

/**
 * Rotate a canvas to correct EXIF orientation. Returns a new canvas.
 * Orientation values: 1=normal, 3=180°, 6=90°CW, 8=90°CCW.
 */
export function rotateCanvasByExif(canvas, exifOrientation) {
  if (!exifOrientation || exifOrientation === 1) return canvas

  const w = canvas.width
  const h = canvas.height
  const rotated = document.createElement('canvas')
  const ctx = rotated.getContext('2d')

  switch (exifOrientation) {
    case 3: // 180°
      rotated.width = w
      rotated.height = h
      ctx.translate(w, h)
      ctx.rotate(Math.PI)
      break
    case 6: // 90° CW
      rotated.width = h
      rotated.height = w
      ctx.translate(h, 0)
      ctx.rotate(Math.PI / 2)
      break
    case 8: // 90° CCW
      rotated.width = h
      rotated.height = w
      ctx.translate(0, w)
      ctx.rotate(-Math.PI / 2)
      break
    default:
      return canvas
  }
  ctx.drawImage(canvas, 0, 0)
  return rotated
}

/**
 * Read EXIF orientation (1–8) from an image blob. Returns 1 if unavailable.
 */
export async function getExifOrientation(blob) {
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const exif = piexif.load(dataUrl)
    return exif['0th'][piexif.ImageIFD.Orientation]?.[0] || 1
  } catch {
    return 1
  }
}
