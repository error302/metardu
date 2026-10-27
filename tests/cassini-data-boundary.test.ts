/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import corners from '../data/cassini/subsheet-data.cjs'

test('the typed data loader preserves every canonical coordinate and its canonical LF file hash', () => {
  const raw = readFileSync(path.join(process.cwd(), 'data/cassini/merged_subsheets.json'))
  const original: unknown = JSON.parse(raw.toString('utf8'))
  // Existing Windows checkouts can retain CRLF until their next checkout. Only
  // that newline representation is normalized; coordinate/format drift fails.
  const canonicalBytes = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'))
  expect(createHash('sha256').update(canonicalBytes).digest('hex')).toBe('734face267b96ec4279fb216bdd961cc9ee36f4fbf5619e09e9f242f20ce1a77')
  expect(corners).toEqual(original)
  expect(Object.keys(corners)).toHaveLength(226)
  expect(Object.values(corners).flatMap(sheet => Object.values(sheet))).toHaveLength(5626)
  const allCorners = Object.values(corners).flatMap(sheet => Object.values(sheet)).flat()
  expect(allCorners).toHaveLength(22503)
  expect(allCorners.every(c => [c.cassX, c.cassY, c.utmE, c.utmN].every(Number.isFinite))).toBe(true)
})
