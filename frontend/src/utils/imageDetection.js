import '@tensorflow/tfjs'  // side-effect: registers the WebGL/CPU backend for coco-ssd
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import { createWorker } from 'tesseract.js'

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

// COCO-SSD only knows generic objects — map the few drink-ish ones to a category.
const DRINK_CLASS_TO_CATEGORY = {
  'wine glass': 'Wine',
  cup: 'Cocktail',
}

// Small country/region gazetteer for matching OCR text → Country field.
const COUNTRIES = [
  'Norway', 'Norge', 'Sweden', 'Sverige', 'Denmark', 'Danmark', 'Finland',
  'Iceland', 'Germany', 'Deutschland', 'Belgium', 'België', 'Belgique',
  'Netherlands', 'Holland', 'France', 'Italy', 'Italia', 'Spain', 'España',
  'Portugal', 'Ireland', 'Scotland', 'England', 'United Kingdom', 'UK',
  'USA', 'United States', 'America', 'Canada', 'Mexico', 'Czech', 'Czechia',
  'Poland', 'Austria', 'Switzerland', 'Japan', 'China', 'Australia',
  'New Zealand', 'Brazil', 'Argentina', 'Chile', 'Estonia', 'Latvia', 'Lithuania',
]

/**
 * Detect drink in image and return bounding box + suggested category for smart crop
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
      category: DRINK_CLASS_TO_CATEGORY[largest.class.toLowerCase()] || null,
    }
  } catch (e) {
    console.error('Drink detection failed:', e)
    return null
  }
}

/**
 * Extract text from image using OCR and parse out name, brand, ABV, country.
 */
export async function detectTextAndABV(canvas) {
  const empty = { text: '', name: null, brand: null, abv: null, country: null }
  try {
    const worker = await createWorker('eng')
    const result = await worker.recognize(canvas)
    const text = result.data.text || ''
    await worker.terminate()

    // Clean lines, drop noise
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length >= 2 && /[a-zA-ZæøåÆØÅ]/.test(l))

    // ABV: "5.5%", "ABV 7,2", "Alc. 4.7% vol"
    const abvMatch = text.match(/(?:ABV|ALC[.\s]*(?:VOL)?)[:\s]*?(\d{1,2}[.,]\d)\s*%?|(\d{1,2}[.,]\d)\s*%/i)
    const abv = abvMatch ? (abvMatch[1] || abvMatch[2]).replace(',', '.') : null

    // Country: first gazetteer hit (case-insensitive, whole word)
    let country = null
    for (const c of COUNTRIES) {
      if (new RegExp(`\\b${c}\\b`, 'i').test(text)) { country = c; break }
    }

    // Brand: prefer a mostly-uppercase line (label brands are usually all-caps)
    const upperLine = lines.find(l => {
      const letters = l.replace(/[^a-zA-ZæøåÆØÅ]/g, '')
      return letters.length >= 3 && letters === letters.toUpperCase()
    })
    // Name: the longest "wordy" line is usually the product name
    const wordy = [...lines].sort((a, b) => b.length - a.length)
    const name = wordy[0] || null
    const brand = upperLine || (lines[0] !== name ? lines[0] : null)

    return { text, name, brand, abv, country }
  } catch (e) {
    console.error('OCR failed:', e)
    return empty
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
 * Run the detection suite. Emits progress stages via onProgress so the UI can
 * show what's happening.
 *
 * @param canvas      source canvas
 * @param opts        { smart, quality, onProgress }
 *                      smart   – run ML drink/brand/ABV recognition
 *                      quality – run blur/darkness checks
 *                      onProgress(stage) – 'quality'|'loading-model'|'detecting'|'reading-text'|'done'
 */
export async function runFullDetection(canvas, opts = {}) {
  const { smart = false, quality = true, onProgress = () => {} } = opts

  const results = {
    orientation: detectOrientation(canvas),
    isBlurry: false,
    isDark: false,
    drink: null,
    ocr: { text: '', name: null, brand: null, abv: null, country: null },
  }

  if (quality) {
    onProgress('quality')
    results.isBlurry = detectBlur(canvas)
    results.isDark = detectDarkness(canvas)
  }

  if (smart) {
    try {
      onProgress('loading-model')
      await loadCocoModel()
      onProgress('detecting')
      results.drink = await detectDrink(canvas)

      onProgress('reading-text')
      // OCR is worth running even if no bottle was localized (labels/cans)
      results.ocr = await detectTextAndABV(canvas)
    } catch (e) {
      console.error('Detection error:', e)
    }
  }

  onProgress('done')
  return results
}
