// Copies the OCR and barcode engines (WebAssembly + language data) from node_modules to
// public/ocr/, so they're served by this site and bundled in the phone apps: nothing is fetched
// from a CDN, they work offline, and the CSP can stay 'self'. Run before `vite` and `vite build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'ocr')
mkdirSync(out, { recursive: true })
const modules = join(root, 'node_modules')

function copy(from, name = basename(from)) {
  if (!existsSync(from)) throw new Error(`Missing ${from}: run npm install`)
  copyFileSync(from, join(out, name))
}

// tesseract.js: the worker script, and the LSTM-only cores (plain, SIMD and relaxed SIMD; the worker
// picks the best one the browser supports). The core is the version tesseract.js itself depends on.
copy(join(modules, 'tesseract.js', 'dist', 'worker.min.js'))
const core = dirname(createRequire(join(modules, 'tesseract.js', 'package.json')).resolve('tesseract.js-core/package.json'))
for (const file of readdirSync(core)) {
  // The .wasm.js files have the WebAssembly built in, which is what tesseract.js loads.
  if (/^tesseract-core(-simd|-relaxedsimd)?-lstm\.wasm\.js$/.test(file)) copy(join(core, file))
}
// Language data: English and Norwegian (the standard 4.0.0 models).
for (const lang of ['eng', 'nor']) {
  const base = join(modules, '@tesseract.js-data', lang)
  const version = readdirSync(base).find((d) => d === '4.0.0') ?? readdirSync(base).find((d) => /^4/.test(d))
  if (!version) throw new Error(`No traineddata in ${base}`)
  copy(join(base, version, `${lang}.traineddata.gz`))
}
// zxing-wasm, used by the barcode-detector polyfill where the browser has no BarcodeDetector.
const zxing = join(modules, 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm')
copy(zxing)
console.log('Copied OCR and barcode engines to public/ocr/')
