/** @jest-environment node */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import sharp from 'sharp'

interface ManifestIcon {
  src: string
  sizes: string
  type?: string
  purpose?: string
}

interface ArtworkMask {
  width: number
  height: number
  pixels: Uint8Array
}

const publicDir = path.join(process.cwd(), 'public')
const manifest = JSON.parse(
  fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8')
) as { icons: ManifestIcon[]; shortcuts: Array<{ icons: ManifestIcon[] }> }

function isArtworkPixel(red: number, green: number, blue: number): boolean {
  const orange =
    red > 140 &&
    red > green * 1.35 &&
    green > blue * 1.15 &&
    red - green > 45
  const white = red > 220 && green > 220 && blue > 220
  return orange || white
}

async function readArtworkMask(filePath: string): Promise<ArtworkMask> {
  const { data, info } = await sharp(filePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixels = new Uint8Array(info.width * info.height)

  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 3
    pixels[index] = isArtworkPixel(
      data[offset],
      data[offset + 1],
      data[offset + 2]
    )
      ? 255
      : 0
  }

  return { width: info.width, height: info.height, pixels }
}

function cropToArtwork(mask: ArtworkMask): ArtworkMask {
  let minX = mask.width
  let minY = mask.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.pixels[y * mask.width + x] === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < 0 || maxY < 0) {
    throw new Error('Icon contains no recognizable METARDU artwork')
  }

  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const pixels = new Uint8Array(width * height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels[y * width + x] =
        mask.pixels[(minY + y) * mask.width + minX + x]
    }
  }

  return { width, height, pixels }
}

async function normalizedArtwork(mask: ArtworkMask): Promise<Uint8Array> {
  const cropped = cropToArtwork(mask)
  return sharp(cropped.pixels, {
    raw: { width: cropped.width, height: cropped.height, channels: 1 },
  })
    .resize(64, 64, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer()
}

function intersectionOverUnion(a: Uint8Array, b: Uint8Array): number {
  let intersection = 0
  let union = 0

  for (let index = 0; index < a.length; index += 1) {
    const aPixel = a[index] > 127
    const bPixel = b[index] > 127
    if (aPixel && bPixel) intersection += 1
    if (aPixel || bPixel) union += 1
  }

  return union === 0 ? 0 : intersection / union
}

function artworkBounds(mask: ArtworkMask) {
  let minX = mask.width
  let minY = mask.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.pixels[y * mask.width + x] === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return {
    left: minX / mask.width,
    top: minY / mask.height,
    right: maxX / mask.width,
    bottom: maxY / mask.height,
  }
}

describe('installed mobile brand assets', () => {
  it('uses one robot-only METARDU mark for every installed icon variant', async () => {
    const canonical = await normalizedArtwork(
      await readArtworkMask(path.join(publicDir, 'metardu-icon.png'))
    )
    const iconDirectory = path.join(publicDir, 'icons')
    const installedIcons = [
      path.join(publicDir, 'apple-touch-icon.png'),
      ...fs
        .readdirSync(iconDirectory)
        .filter(name => name.endsWith('.png'))
        .map(name => path.join(iconDirectory, name)),
    ]

    for (const iconPath of installedIcons) {
      const artwork = await normalizedArtwork(await readArtworkMask(iconPath))
      const similarity = intersectionOverUnion(canonical, artwork)
      if (similarity < 0.4) {
        throw new Error(
          `${path.relative(publicDir, iconPath)} does not match the canonical METARDU robot mark`
        )
      }
    }
  })

  it('links the Apple install icon through a content-addressed immutable URL', () => {
    const layout = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'layout.tsx'),
      'utf8'
    )
    const appleTouchIconLinks = [
      ...layout.matchAll(
        /<link\s+rel="apple-touch-icon"\s+href="([^"]+)"\s*\/>/g
      ),
    ]
    expect(appleTouchIconLinks).toHaveLength(1)
    const appleTouchIcon = appleTouchIconLinks[0]?.[1]
    expect(appleTouchIcon).toMatch(
      /^\/icons\/apple-touch-icon-[a-f0-9]{12}\.png$/
    )

    const iconPath = path.join(publicDir, appleTouchIcon?.slice(1) ?? '')
    expect(fs.existsSync(iconPath)).toBe(true)
    const iconBytes = fs.readFileSync(iconPath)
    const canonicalBytes = fs.readFileSync(path.join(publicDir, 'apple-touch-icon.png'))
    const digest = createHash('sha256').update(iconBytes).digest('hex')
    const canonicalDigest = createHash('sha256').update(canonicalBytes).digest('hex')
    expect(iconBytes.equals(canonicalBytes)).toBe(true)
    expect(digest).toBe(canonicalDigest)
    expect(appleTouchIcon).toContain(digest.slice(0, 12))
    expect(
      fs
        .readdirSync(path.join(publicDir, 'icons'))
        .filter(name => /^apple-touch-icon-[a-f0-9]{12}\.png$/.test(name))
    ).toEqual([`apple-touch-icon-${digest.slice(0, 12)}.png`])
  })

  it('declares maskable icons whose artwork remains inside the safe zone', async () => {
    const maskableIcons = manifest.icons.filter(
      icon => icon.purpose === 'maskable'
    )
    expect(maskableIcons.length).toBeGreaterThanOrEqual(4)

    for (const icon of maskableIcons) {
      const bounds = artworkBounds(
        await readArtworkMask(path.join(publicDir, icon.src))
      )
      expect(bounds.left).toBeGreaterThanOrEqual(0.1)
      expect(bounds.top).toBeGreaterThanOrEqual(0.1)
      expect(bounds.right).toBeLessThanOrEqual(0.9)
      expect(bounds.bottom).toBeLessThanOrEqual(0.9)
    }
  })
})
