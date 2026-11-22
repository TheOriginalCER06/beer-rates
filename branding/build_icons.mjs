// Makes every icon the website, the docs and the phone apps need from the handmade logo,
// branding/logo.svg (16 × 16, transparent). The artwork is never changed: where a format needs a
// solid icon (app icons, Android launcher, iOS), it's centred on the dark brown background.
//
//   node branding/build_icons.mjs      (needs `npm ci` in docs/, which has sharp)
//
// Writes frontend/public/{favicon.svg,icon-192.png,icon-512.png,icon-maskable-512.png,apple-touch-icon.png},
// docs/public/favicon.svg and docs/src/assets/logo.svg, and, where the folders exist, the Android
// launcher icons and splash screens and the iOS app icon and splash.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const sharp = createRequire(join(ROOT, 'docs', 'package.json'))('sharp')
const LOGO = join(ROOT, 'branding', 'logo.svg')
const SVG = readFileSync(LOGO)
const BACKGROUND = '#2b1a0b'
const PUBLIC = join(ROOT, 'frontend', 'public')
const ANDROID_RES = join(ROOT, 'frontend', 'android', 'app', 'src', 'main', 'res')
const IOS_ASSETS = join(ROOT, 'frontend', 'ios', 'App', 'App', 'Assets.xcassets')

function log(path) {
  console.log('wrote', relative(ROOT, path))
}

/** The logo alone, `size` px square, transparent. */
function artwork(size) {
  // The SVG is 16 units wide; density 72 renders 1 unit as 1 px.
  return sharp(SVG, { density: (72 * size) / 16 })
    .resize(size, size)
    .png()
    .toBuffer()
}

/**
 * A `size` px icon: the logo at `scale` of the size, centred, on the background (or transparent).
 * `shape`: 'rounded' (app icon corners), 'circle', or 'square'.
 */
async function icon(size, { scale = 0.8, background = BACKGROUND, shape = 'square' } = {}) {
  const inner = Math.round(size * scale)
  const offset = Math.round((size - inner) / 2)
  let image = sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: await artwork(inner), left: offset, top: offset }])
  if (shape !== 'square') {
    const mask =
      shape === 'circle'
        ? `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`
        : `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}"/></svg>`
    image = sharp(await image.png().toBuffer()).composite([{ input: Buffer.from(mask), blend: 'dest-in' }])
  }
  return image.png({ compressionLevel: 9 }).toBuffer()
}

async function save(buffer, path) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, await buffer)
  log(path)
}

async function splash(width, height) {
  const side = Math.round(Math.min(width, height) * 0.3)
  return sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .composite([{ input: await artwork(side), left: Math.round((width - side) / 2), top: Math.round((height - side) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

// The SVG itself, unchanged, wherever a favicon or logo file is used.
for (const target of [join(PUBLIC, 'favicon.svg'), join(ROOT, 'docs', 'public', 'favicon.svg'), join(ROOT, 'docs', 'src', 'assets', 'logo.svg')]) {
  copyFileSync(LOGO, target)
  log(target)
}

await save(icon(192, { shape: 'rounded' }), join(PUBLIC, 'icon-192.png'))
await save(icon(512, { shape: 'rounded' }), join(PUBLIC, 'icon-512.png'))
// Maskable: full-bleed background, logo inside the 80 % safe zone.
await save(icon(512, { scale: 0.62 }), join(PUBLIC, 'icon-maskable-512.png'))
// iOS rounds the corners itself.
await save(icon(180), join(PUBLIC, 'apple-touch-icon.png'))

if (existsSync(ANDROID_RES)) {
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
  for (const [name, factor] of Object.entries(densities)) {
    const folder = join(ANDROID_RES, `mipmap-${name}`)
    await save(icon(Math.round(48 * factor), { shape: 'rounded' }), join(folder, 'ic_launcher.png'))
    await save(icon(Math.round(48 * factor), { shape: 'circle', scale: 0.72 }), join(folder, 'ic_launcher_round.png'))
    // Adaptive icon foreground: 108 dp canvas, the launcher shows the middle 72 dp.
    await save(icon(Math.round(108 * factor), { scale: 0.5, background: null }), join(folder, 'ic_launcher_foreground.png'))
  }
  const color = join(ANDROID_RES, 'values', 'ic_launcher_background.xml')
  writeFileSync(
    color,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BACKGROUND.toUpperCase()}</color>\n</resources>\n`,
  )
  log(color)
  for (const folder of readdirSync(ANDROID_RES).filter((d) => d.startsWith('drawable'))) {
    const path = join(ANDROID_RES, folder, 'splash.png')
    if (!existsSync(path)) continue
    const { width, height } = await sharp(path).metadata()
    await save(splash(width, height), path)
  }
}

if (existsSync(IOS_ASSETS)) {
  // The App Store icon must be opaque, without its own rounded corners.
  await save(sharp(await icon(1024)).flatten({ background: BACKGROUND }).png().toBuffer(), join(IOS_ASSETS, 'AppIcon.appiconset', 'AppIcon-512@2x.png'))
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await save(splash(2732, 2732), join(IOS_ASSETS, 'Splash.imageset', name))
  }
}
