import { describe, expect, it } from '@jest/globals'
import { isUsableCachedTileSource } from '../cachedXyzLayer'
import type { CachedSourceInfo } from '../tileCache'

const baseSource: CachedSourceInfo = {
  sourceId: 'custom-abc',
  label: 'County topo',
  urlTemplate: 'https://tiles.example.com/{z}/{x}/{y}.png',
  attribution: '© County Survey Office',
  minZoom: 8,
  maxZoom: 16,
  stats: { count: 12, sizeBytes: 4096, newestTimestamp: 1 },
}

describe('cached XYZ basemap metadata', () => {
  it('accepts only sources that have URL, attribution, and a valid zoom interval', () => {
    expect(isUsableCachedTileSource(baseSource)).toBe(true)
    expect(isUsableCachedTileSource({ ...baseSource, attribution: '' })).toBe(false)
    expect(isUsableCachedTileSource({ ...baseSource, maxZoom: 7 })).toBe(false)
    expect(isUsableCachedTileSource({ ...baseSource, urlTemplate: undefined })).toBe(false)
  })
})
