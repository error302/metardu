import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { syncAppleTouchIcon } from '../scripts/generate-pwa-icons.mjs'

async function temporaryRoot() {
  const approvedRoot = path.join(os.tmpdir(), 'opencode')
  await mkdir(approvedRoot, { recursive: true })
  return mkdtemp(path.join(approvedRoot, 'metardu-pwa-icons-'))
}

test('synchronizes the Apple install icon URL and removes stale hashed assets', async () => {
  const root = await temporaryRoot()
  try {
    const iconDirectory = path.join(root, 'public', 'icons')
    const sourceDirectory = path.join(root, 'src', 'app')
    await mkdir(iconDirectory, { recursive: true })
    await mkdir(sourceDirectory, { recursive: true })

    const canonicalPath = path.join(root, 'public', 'apple-touch-icon.png')
    const canonicalBytes = Buffer.from('approved-robot-icon-bytes')
    await writeFile(canonicalPath, canonicalBytes)
    await writeFile(path.join(iconDirectory, 'apple-touch-icon-deadbeef1234.png'), 'stale')
    const layoutPath = path.join(sourceDirectory, 'layout.tsx')
    await writeFile(
      layoutPath,
      '<head><link rel="apple-touch-icon" href="/icons/apple-touch-icon-deadbeef1234.png" /></head>\n'
    )

    const result = await syncAppleTouchIcon({ root })

    const digest = createHash('sha256').update(canonicalBytes).digest('hex')
    const expectedName = `apple-touch-icon-${digest.slice(0, 12)}.png`
    assert.equal(result.fileName, expectedName)
    assert.match(
      await readFile(layoutPath, 'utf8'),
      new RegExp(`href="/icons/${expectedName}"`)
    )
    assert.deepEqual(
      (await readdir(iconDirectory)).filter(name =>
        /^apple-touch-icon-[a-f0-9]{12}\.png$/.test(name)
      ),
      [expectedName]
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('refuses ambiguous Apple install icon links', async () => {
  const root = await temporaryRoot()
  try {
    const iconDirectory = path.join(root, 'public', 'icons')
    const sourceDirectory = path.join(root, 'src', 'app')
    await mkdir(iconDirectory, { recursive: true })
    await mkdir(sourceDirectory, { recursive: true })
    await writeFile(path.join(root, 'public', 'apple-touch-icon.png'), 'icon')
    const layoutPath = path.join(sourceDirectory, 'layout.tsx')
    await writeFile(
      layoutPath,
      '<link rel="apple-touch-icon" href="/icons/one.png" /><link rel="apple-touch-icon" href="/icons/two.png" />\n'
    )

    await assert.rejects(
      syncAppleTouchIcon({ root }),
      /exactly one Apple touch-icon link/i
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
