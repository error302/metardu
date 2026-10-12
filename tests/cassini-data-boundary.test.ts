/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import corners from '../data/cassini/subsheet-data.cjs'

test('the typed data loader preserves every canonical coordinate and its file hash', () => {
  const raw = readFileSync(path.join(process.cwd(), 'data/cassini/merged_subsheets.json'))
  const original: unknown = JSON.parse(raw.toString('utf8'))
  expect(createHash('sha256').update(raw).digest('hex')).toBe('ae5bf4ddf022b220068f1ca2b249a6ce1f28391e6ee72591eba91f88334b48bf')
  expect(corners).toEqual(original)
  expect(Object.keys(corners)).toHaveLength(226)
  expect(Object.values(corners).flatMap(sheet => Object.values(sheet))).toHaveLength(5626)
  const allCorners = Object.values(corners).flatMap(sheet => Object.values(sheet)).flat()
  expect(allCorners).toHaveLength(22503)
  expect(allCorners.every(c => [c.cassX, c.cassY, c.utmE, c.utmN].every(Number.isFinite))).toBe(true)
})
