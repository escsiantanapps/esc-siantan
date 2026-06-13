import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(__dirname, 'icon-source.svg')
const outDir = path.join(__dirname, '..', 'public', 'icons')

mkdirSync(outDir, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-192.png', size: 192, padding: 0.1 },
  { file: 'icon-maskable-512.png', size: 512, padding: 0.1 },
  { file: '../apple-touch-icon.png', size: 180 },
]

for (const { file, size, padding } of targets) {
  const out = path.join(outDir, file)
  if (padding) {
    const inner = Math.round(size * (1 - padding * 2))
    const resized = await sharp(src).resize(inner, inner).toBuffer()
    await sharp({
      create: { width: size, height: size, channels: 4, background: '#E63946' },
    })
      .composite([{ input: resized, top: Math.round((size - inner) / 2), left: Math.round((size - inner) / 2) }])
      .png()
      .toFile(out)
  } else {
    await sharp(src).resize(size, size).png().toFile(out)
  }
  console.log('✓', path.relative(path.join(__dirname, '..'), out))
}
