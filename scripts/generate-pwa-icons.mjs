/**
 * Builds the installable-app icons in public/icons/ from the company logo (public/power-icon.png).
 * Re-run it whenever the logo changes:
 *   node scripts/generate-pwa-icons.mjs [--source <png>]
 *
 * - icon-*.png      logo on a transparent square, small margin (manifest purpose "any")
 * - maskable-*.png  logo at ~64% on white, inside Android's 80% safe zone (purpose "maskable")
 * - apple-touch-icon.png  180x180 on white, since iOS turns transparency black
 */

import { mkdirSync } from 'node:fs'
import path from 'node:path'

import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const sourceArg = process.argv.indexOf('--source')
const source = sourceArg > -1 ? path.resolve(process.argv[sourceArg + 1]) : path.join(root, 'public/power-icon.png')
const outDir = path.join(root, 'public/icons')

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

const icons = [
  { file: 'icon-192.png', size: 192, logo: 0.9, background: TRANSPARENT },
  { file: 'icon-512.png', size: 512, logo: 0.9, background: TRANSPARENT },
  { file: 'maskable-192.png', size: 192, logo: 0.64, background: WHITE },
  { file: 'maskable-512.png', size: 512, logo: 0.64, background: WHITE },
  { file: 'apple-touch-icon.png', size: 180, logo: 0.8, background: WHITE },
]

mkdirSync(outDir, { recursive: true })
const trimmed = await sharp(source).trim().toBuffer()

for (const { file, size, logo, background } of icons) {
  const inner = Math.round(size * logo)
  const resized = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: resized, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, file))
  console.log(`wrote public/icons/${file} (${size}x${size})`)
}
