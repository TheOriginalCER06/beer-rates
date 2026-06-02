import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import { createWorker } from 'tesseract.js'

let cocoModel = null
let cocoLoading = null

/**
 * Load COCO-SSD once. Initialises a GPU (WebGL) backend when available — falling
 * back to CPU — before loading, otherwise detection can resolve instantly with
 * no results. Concurrent callers share one in-flight load.
 */
async function loadCocoModel() {
  if (cocoModel) return cocoModel
  if (!cocoLoading) {
    cocoLoading = (async () => {
      await tf.ready()
      try {
        await tf.setBackend('webgl')
      } catch { /* no WebGL — fall through */ }
      if (tf.getBackend() !== 'webgl') {
        try { await tf.setBackend('cpu') } catch { /* keep default */ }
      }
      // 'mobilenet_v2' is more accurate than the default lite base — worth it
      // since this only runs on explicit user request.
      cocoModel = await cocoSsd.load({ base: 'mobilenet_v2' })
      return cocoModel
    })()
  }
  return cocoLoading
}

/** Downscale a canvas so its longest side ≤ maxSide. Returns { canvas, scale }. */
function downscaleCanvas(canvas, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height))
  if (scale >= 1) return { canvas, scale: 1 }
  const out = document.createElement('canvas')
  out.width = Math.round(canvas.width * scale)
  out.height = Math.round(canvas.height * scale)
  out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height)
  return { canvas: out, scale }
}

/**
 * Detect blur via the variance of the Laplacian: sharp images have high
 * edge energy, blurry ones low. Uses a correct 4-neighbour Laplacian over a
 * proper 2D grid. Tuned for a downscaled (~400px) grayscale input.
 */
export function detectBlur(canvas, threshold = 12) {
  const w = canvas.width
  const h = canvas.height
  if (w < 3 || h < 3) return false

  const { data } = canvas.getContext('2d').getImageData(0, 0, w, h)
  const gray = new Float64Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]
      sum += lap
      sumSq += lap * lap
      n++
    }
  }
  if (n === 0) return false
  const variance = sumSq / n - (sum / n) ** 2
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

const DRINK_CLASSES = ['bottle', 'cup', 'wine glass']

/**
 * Detect a drink and return its bounding box (in source-canvas pixels) + a
 * suggested category. Runs on a downscaled copy for speed and uses a low score
 * threshold so partially-occluded bottles/cans still register.
 */
export async function detectDrink(canvas) {
  const model = await loadCocoModel()

  // COCO-SSD resizes internally, but feeding a smaller canvas is markedly faster.
  const { canvas: small, scale } = downscaleCanvas(canvas, 512)
  // detect(img, maxNumBoxes, minScore) — default minScore 0.5 is too strict here.
  const predictions = await model.detect(small, 20, 0.2)
  console.debug('[detect] predictions:', predictions.map(p => `${p.class} ${p.score.toFixed(2)}`))

  const drinks = predictions.filter(p => DRINK_CLASSES.includes(p.class.toLowerCase()))
  if (drinks.length === 0) return null

  // Largest detection wins (most likely the subject)
  const best = drinks.reduce((a, b) =>
    (a.bbox[2] * a.bbox[3] >= b.bbox[2] * b.bbox[3] ? a : b))

  // Scale the box back up to the original canvas coordinate space
  const bbox = best.bbox.map(v => v / scale)

  return {
    class: best.class,
    score: best.score,
    bbox, // [x, y, width, height] in source-canvas pixels
    category: DRINK_CLASS_TO_CATEGORY[best.class.toLowerCase()] || null,
  }
}

/**
 * Pre-process a canvas for OCR: grayscale + contrast stretch, and upscale small
 * label crops so glyphs are big enough for Tesseract. Bottle labels have low
 * contrast and small text, so this markedly improves recognition.
 */
function preprocessForOcr(canvas, { minWidth = 1100, maxWidth = 1600 } = {}) {
  // Upscale narrow crops, cap very wide ones
  let targetW = canvas.width
  if (targetW < minWidth) targetW = minWidth
  if (targetW > maxWidth) targetW = maxWidth
  const scale = targetW / canvas.width

  const out = document.createElement('canvas')
  out.width = Math.round(canvas.width * scale)
  out.height = Math.round(canvas.height * scale)
  const ctx = out.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, out.width, out.height)

  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d = img.data
  // First pass: grayscale + collect min/max for contrast stretch
  let lo = 255, hi = 0
  const gray = new Uint8ClampedArray(d.length / 4)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    gray[p] = g
    if (g < lo) lo = g
    if (g > hi) hi = g
  }
  const range = Math.max(1, hi - lo)
  // Second pass: stretch contrast and write back
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = ((gray[p] - lo) / range) * 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return out
}

/**
 * Extract text from image using OCR and parse out name, brand, ABV, country.
 */
export async function detectTextAndABV(canvas) {
  const empty = { text: '', name: null, brand: null, abv: null, country: null }
  try {
    const prepped = preprocessForOcr(canvas)
    const worker = await createWorker('eng')
    // PSM 6 = assume a single uniform block of text (good for labels);
    // 4 (column) is a decent alternative. Keep the full charset for brand names.
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })
    const result = await worker.recognize(prepped)
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
    // Quality heuristics don't need full resolution — downscale for speed.
    const { canvas: q } = downscaleCanvas(canvas, 400)
    results.isBlurry = detectBlur(q)
    results.isDark = detectDarkness(q)
  }

  if (smart) {
    try {
      onProgress('loading-model')
      await loadCocoModel()

      onProgress('detecting')
      results.drink = await detectDrink(canvas)

      onProgress('reading-text')
      // Focus OCR on the detected drink (expanded a little) — faster and more
      // accurate than scanning the whole frame. Fall back to the full image.
      const region = results.drink ? smartCropDrink(canvas, results.drink.bbox, 0.12) : canvas
      results.ocr = await detectTextAndABV(region)
    } catch (e) {
      console.error('Detection error:', e)
    }
  }

  onProgress('done')
  return results
}
