// Reading the label (OCR) with tesseract.js, on the device. The engine and the English and
// Norwegian language data are served from /ocr/ (scripts/copy-wasm.mjs), loaded the first time
// and cached. The text isn't trusted blindly: it becomes suggestions the user taps, and a search
// in the online databases, which gives clean names.
import { forOcr } from './photo'

export interface LabelText {
  lines: string[]
  /** Best guess for the name (the most prominent line). */
  name: string | null
  abv: number | null
  /** What to search the databases for. */
  query: string
}

type Worker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>
let worker: Promise<Worker> | null = null

function base(): string {
  return new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href
}

async function getWorker(onProgress?: (p: number) => void): Promise<Worker> {
  if (!worker) {
    worker = import('tesseract.js').then(({ createWorker, OEM }) =>
      createWorker(['eng', 'nor'], OEM.LSTM_ONLY, {
        workerPath: `${base()}worker.min.js`,
        corePath: base(),
        langPath: base(),
        gzip: true,
        workerBlobURL: false,
        logger: (m) => {
          if (m.status === 'recognizing text') onProgress?.(m.progress)
        },
      }),
    )
    worker.catch(() => {
      worker = null
    })
  }
  return worker
}

const ABV = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:vol|alc|abv)?/i
const NOISE = /^(?:[\W\d_]+|.{1,2})$/

/** Pull the ABV and likely name out of OCR lines. */
export function parseLabel(text: string): LabelText {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/[|_~^`"“”]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3 && !NOISE.test(l) && /[a-zA-ZæøåÆØÅ]{3}/.test(l))

  let abv: number | null = null
  const match = ABV.exec(text)
  if (match) {
    const value = Number(match[1].replace(',', '.'))
    if (value >= 0 && value <= 80) abv = value
  }

  // Labels put the name in big letters: prefer short-ish lines in capitals, then longer lines.
  const scored = lines
    .filter((l) => !ABV.test(l) && !/\b(?:cl|ml|liter|litre|ingredien|brewed|brygget|best before|contains)\b/i.test(l))
    .map((l) => {
      const letters = l.replace(/[^a-zA-ZæøåÆØÅ]/g, '')
      const upper = letters.replace(/[^A-ZÆØÅ]/g, '').length / Math.max(1, letters.length)
      const words = l.split(' ').length
      return { line: l, score: letters.length * (upper > 0.7 ? 1.6 : 1) - Math.max(0, words - 4) * 6 }
    })
    .sort((a, b) => b.score - a.score)
  const name = scored[0]?.line ?? null
  const query = scored
    .slice(0, 2)
    .map((s) => s.line)
    .join(' ')
    .slice(0, 60)
  return { lines: scored.slice(0, 6).map((s) => s.line), name, abv, query }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('timed out')), ms)),
  ])
}

/** Read the text on a (cropped) photo. Gives up after two minutes (e.g. the engine didn't load). */
export async function readLabel(photo: Blob, onProgress?: (p: number) => void): Promise<LabelText> {
  try {
    const [ocr, canvas] = await withTimeout(Promise.all([getWorker(onProgress), forOcr(photo)]), 120_000)
    const { data } = await withTimeout(ocr.recognize(canvas), 120_000)
    return parseLabel(data.text)
  } catch (error) {
    // Start a fresh engine next time.
    void worker?.then((w) => w.terminate()).catch(() => undefined)
    worker = null
    throw error
  }
}
