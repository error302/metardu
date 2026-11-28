#!/usr/bin/env node
/**
 * Generate the installed mobile icon set from the canonical square robot mark.
 *
 * The source artwork stays undistorted. Standard icons receive a small safe
 * margin, while maskable icons use a larger margin so Android's adaptive and
 * circular masks cannot clip the brandmark. Generated files are derived from
 * the repository-owned canonical source and must not be hand-edited.
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(repositoryRoot, 'public')
const iconDir = path.join(publicDir, 'icons')
const sourcePath = path.join(publicDir, 'metardu-icon.png')
const appleTouchIconPattern = /<link\s+rel="apple-touch-icon"\s+href="[^"]+"\s*\/>/
const hashedAppleTouchIconPattern = /^apple-touch-icon-[a-f0-9]{12}\.png$/
const background = { r: 24, g: 28, b: 39, alpha: 1 }

const standardIcons = [72, 96, 128, 144, 152, 180, 192, 256, 384, 512]
const maskableIcons = [192, 256, 384, 512]

async function writeIcon(filePath, size, artworkScale) {
  const artworkSize = Math.max(1, Math.round(size * artworkScale))
  const artwork = await sharp(sourcePath)
    .resize(artworkSize, artworkSize, { fit: 'fill' })
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: artwork, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(filePath)
}

export async function syncAppleTouchIcon({ root = repositoryRoot } = {}) {
  const publicDirectory = path.join(root, 'public')
  const iconDirectory = path.join(publicDirectory, 'icons')
  const canonicalIconPath = path.join(publicDirectory, 'apple-touch-icon.png')
  const layoutPath = path.join(root, 'src', 'app', 'layout.tsx')

  const canonicalBytes = await readFile(canonicalIconPath)
  const digest = createHash('sha256').update(canonicalBytes).digest('hex')
  const fileName = `apple-touch-icon-${digest.slice(0, 12)}.png`
  const href = `/icons/${fileName}`

  const layout = await readFile(layoutPath, 'utf8')
  const matches = layout.match(new RegExp(appleTouchIconPattern.source, 'g')) ?? []
  if (matches.length !== 1) {
    throw new Error(
      `The layout must contain exactly one Apple touch-icon link before icons can be synchronized; found ${matches.length}.`
    )
  }

  await copyFile(canonicalIconPath, path.join(iconDirectory, fileName))
  await writeFile(
    layoutPath,
    layout.replace(
      new RegExp(appleTouchIconPattern.source, 'g'),
      `<link rel="apple-touch-icon" href="${href}" />`
    )
  )

  const existing = await readdir(iconDirectory)
  await Promise.all(
    existing
      .filter(name => hashedAppleTouchIconPattern.test(name) && name !== fileName)
      .map(name => unlink(path.join(iconDirectory, name)))
  )

  return { digest, fileName, href, layoutPath }
}

async function main() {
  await mkdir(iconDir, { recursive: true })

  for (const size of standardIcons) {
    await writeIcon(path.join(iconDir, `icon-${size}.png`), size, 0.78)
  }

  for (const size of maskableIcons) {
    await writeIcon(path.join(iconDir, `maskable-${size}.png`), size, 0.64)
  }

  const appleIconPath = path.join(publicDir, 'apple-touch-icon.png')
  await writeIcon(appleIconPath, 180, 0.78)
  await writeIcon(path.join(iconDir, 'apple-touch-icon.png'), 180, 0.78)

  // iOS may keep an installed Home-screen icon from the URL fetched at install
  // time. Publish the same approved artwork through a content-addressed path
  // so a new installation cannot resolve a stale cached Apple icon.
  await syncAppleTouchIcon({ root: repositoryRoot })

  console.log(`Generated ${standardIcons.length + maskableIcons.length + 3} METARDU mobile icons.`)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
