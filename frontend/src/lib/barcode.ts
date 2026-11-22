// Barcode scanning (EAN/UPC on bottles and cans), all on the device.
//  - Android app: Google's ML Kit scanner (fast, works in poor light).
//  - Website and iOS app: the browser's BarcodeDetector, or the zxing-wasm polyfill served from
//    /ocr/ (copied there by scripts/copy-wasm.mjs) where the browser has none.
import { isNative, platform } from './platform'

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] as const

interface Detector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>
}

let detector: Promise<Detector> | null = null

async function makeDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      if (supported.includes('ean_13')) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) })
    } catch {
      // Fall through to the polyfill.
    }
  }
  const { BarcodeDetector, setZXingModuleOverrides } = await import('barcode-detector/ponyfill')
  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? `${import.meta.env.BASE_URL}ocr/${path}` : prefix + path),
  })
  return new BarcodeDetector({ formats: [...FORMATS] }) as Detector
}

export function getDetector(): Promise<Detector> {
  detector ??= makeDetector()
  return detector
}

/** First barcode found in a picture, or null. */
export async function detectIn(source: ImageBitmapSource): Promise<string | null> {
  const found = await (await getDetector()).detect(source)
  return found[0]?.rawValue ?? null
}

/** The Android app scans with ML Kit's own full-screen scanner. */
export const hasNativeScanner = isNative && platform === 'android'

/** Android app only. Returns the code, or null if cancelled. */
export async function scanNative(): Promise<string | null> {
  const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning')
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
  if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule()
  try {
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.Code128],
    })
    return barcodes[0]?.rawValue ?? null
  } catch (error) {
    if (String(error).toLowerCase().includes('cancel')) return null
    throw error
  }
}
