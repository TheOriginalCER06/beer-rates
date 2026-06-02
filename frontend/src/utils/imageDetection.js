import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import { Tesseract } from 'tesseract.js'
import piexif from 'piexifjs'

let cocoModel = null

/**
 * Load COCO-SSD model once (cached)
 */
async function loadCocoModel() {
  if (!cocoModel) {
    cocoModel = await cocoSsd.load()
  }
  return cocoModel
}

/**
 * Detect EXIF orientation and rotate canvas accordingly
 */
export function rotateCanvasByExif(canvas, exifOrientation) {
  if (!exifOrientation || exifOrientation === 1) return canvas

  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const rotated = document.createElement('canvas')

  // Orientation mappings: 1=normal, 3=180, 6=90CW, 8=90CCW
  switch (exifOrientation) {
    case 3: // 180
      rotated.width = w
      rotated.height = h
      ctx.translate(w, h)
      ctx.rotate(Math.PI)
      ctx.drawImage(canvas, 0, 0)
      break
    case 6: // 90 CW
      rotated.width = h
      rotated.height = w
      ctx.translate(h, 0)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(canvas, 0, 0)
      break
    case 8: // 90 CCW
      rotated.width = h
      rotated.height = w
      ctx.translate(0, w)
      ctx.rotate(-Math.PI / 2)
      ctx.drawImage(canvas, 0, 0)
      break
    default:
      return canvas
  }
  return rotated
}

/**
 * Extract EXIF orientation from JPEG blob
 */
export async function getExifOrientation(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer()
    const exif = piexif.load(arrayBuffer)
    return exif['0th'][piexif.ImageIFD.Orientation]?.[0] || 1
  } catch {
    return 1
  }
}

/**
 * Detect if image is blurry using Laplacian variance
 */
export function detectBlur(canvas, threshold = 100) {
  const ctx = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const gray = []

  // Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }

  // Laplacian kernel
  const lap = [-1, -1, -1, -1, 8, -1, -1, -1, -1]
  let variance = 0
  const w = canvas.width

  for (let i = 1; i < w * (canvas.height - 1) - 1; i++) {
    let conv = 0
    for (let j = 0; j < 9; j++) {
      conv += lap[j] * gray[i + Math.floor((j % 3 - 1)) + Math.floor((j / 3 - 1)) * w]
    }
    variance += conv * conv
  }

  return variance < threshold
}

/**
 * Detect if image is too dark
 */
export function detectDarkness(canvas, threshold = 0.3) {
  const ctx = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  let darkPixels = 0
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255
    if (brightness < 0.2) darkPixels++
  }

  return darkPixels / (canvas.width * canvas.height) > threshold
}

/**
 * Detect image orientation (portrait vs landscape)
 */
export function detectOrientation(canvas) {
  return canvas.height > canvas.width ? 'portrait' : 'landscape'
}

/**
 * Detect drink in image and return bounding box for smart crop
 */
export async function detectDrink(canvas) {
  try {
    const model = await loadCocoModel()
    const predictions = await model.detect(canvas)

    // Look for bottle, cup, glass, wine glass
    const drinkClasses = ['bottle', 'cup', 'glass', 'wine glass', 'beer glass']
    const drinkPredictions = predictions.filter(p => drinkClasses.includes(p.class.toLowerCase()))

    if (drinkPredictions.length === 0) return null

    // Get largest drink detection
    const largest = drinkPredictions.reduce((a, b) => {
      const aArea = a.bbox[2] * a.bbox[3]
      const bArea = b.bbox[2] * b.bbox[3]
      return aArea > bArea ? a : b
    })

    return {
      class: largest.class,
      score: largest.score,
      bbox: largest.bbox, // [x, y, width, height]
    }
  } catch (e) {
    console.error('Drink detection failed:', e)
    return null
  }
}

/**
 * Extract text from image using OCR and try to find brand, ABV
 */
export async function detectTextAndABV(canvas) {
  try {
    const worker = await Tesseract.createWorker()
    const result = await worker.recognize(canvas)
    const text = result.data.text

    await worker.terminate()

    // Extract potential brand (usually uppercase words at start)
    const brandMatch = text.match(/^([A-Z\s]+)/m)
    const brand = brandMatch ? brandMatch[1].trim() : null

    // Extract ABV percentage (e.g., "5.5%", "ABV: 7.2")
    const abvMatch = text.match(/(\d+[.,]\d+)\s*%|ABV[:\s]+(\d+[.,]\d+)/i)
    const abv = abvMatch ? (abvMatch[1] || abvMatch[2]).replace(',', '.') : null

    return { text, brand, abv }
  } catch (e) {
    console.error('OCR failed:', e)
    return { text: '', brand: null, abv: null }
  }
}

/**
 * Smart crop based on detected drink bounding box
 */
export function smartCropDrink(canvas, drinkBbox, padding = 0.15) {
  if (!drinkBbox) return canvas

  let [x, y, w, h] = drinkBbox
  const canvasW = canvas.width
  const canvasH = canvas.height

  // Add padding
  x = Math.max(0, x - canvasW * padding)
  y = Math.max(0, y - canvasH * padding)
  w = Math.min(canvasW - x, w + canvasW * padding * 2)
  h = Math.min(canvasH - y, h + canvasH * padding * 2)

  // Maintain aspect ratio or create square crop
  const cropCanvas = document.createElement('canvas')
  cropCanvas.width = w
  cropCanvas.height = h
  cropCanvas.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h)

  return cropCanvas
}

/**
 * Run full detection suite
 */
export async function runFullDetection(canvas, enableSmartCrop) {
  const results = {
    orientation: detectOrientation(canvas),
    isBlurry: detectBlur(canvas),
    isDark: detectDarkness(canvas),
    drink: null,
    ocr: { text: '', brand: null, abv: null },
  }

  if (enableSmartCrop) {
    try {
      results.drink = await detectDrink(canvas)
      if (results.drink) {
        results.ocr = await detectTextAndABV(canvas)
      }
    } catch (e) {
      console.error('Detection error:', e)
    }
  }

  return results
}
