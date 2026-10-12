#!/usr/bin/env node
/**
 * Fetch the licensed field photographs used on the METARDU landing page.
 * The Commons file page is queried for its current thumbnail, author, and
 * license metadata before the image is converted to a small WebP asset.
 *
 * Usage: node scripts/fetch-landing-photos.mjs [--force]
 *
 * Image files are distributed under their source licenses. See
 * public/landing/CREDITS.md for attribution and change details.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'public', 'landing')
const USER_AGENT = 'METARDU landing image fetcher/1.0 (https://metardu.space)'
const FORCE = process.argv.includes('--force')

const TARGETS = [
  ['hero-survey.webp', 'File:Topographic survey of a bridge.jpg'],
  ['field-levelling.webp', 'File:Survey level and field technician.jpg'],
]

function cleanMetadata(value = '') {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`Wikimedia API returned HTTP ${response.status}`)
  return response.json()
}

async function fetchImage(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`Image download returned HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function main() {
  for (const [outputName, fileTitle] of TARGETS) {
    const outputPath = path.join(OUT_DIR, outputName)
    const params = new URLSearchParams({
      action: 'query',
      titles: fileTitle,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '1800',
      format: 'json',
    })
    const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`)
    const page = Object.values(data.query?.pages ?? {})[0]
    const image = page?.imageinfo?.[0]
    if (!image?.thumburl) throw new Error(`No downloadable image found for ${fileTitle}`)
    const author = cleanMetadata(image.extmetadata?.Artist?.value ?? 'Author not listed')
    const license = cleanMetadata(image.extmetadata?.LicenseShortName?.value ?? 'License not listed')
    const bytes = await fetchImage(image.thumburl)
    const webp = await sharp(bytes)
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84, effort: 5 })
      .toBuffer()

    try {
      await writeFile(outputPath, webp, { flag: FORCE ? 'w' : 'wx' })
    } catch (error) {
      if (error?.code === 'EEXIST') throw new Error(`${outputName} already exists; pass --force to replace it`)
      throw error
    }

    console.log(`${outputName}: ${(webp.length / 1024).toFixed(0)} KB · ${author} · ${license}`)
    console.log(`  ${image.descriptionurl}`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
