/**
 * Offline Tile Cache Tests
 * Run: npx jest src/lib/offline/__tests__/tileCache.test.ts
 */

import { describe, it, expect } from '@jest/globals'

import {
  calculateTileCount,
  calculateTileBounds,
  estimateStorageSize,
  downloadTilesForBounds,
  expandXyzTileUrl,
  getTileSourceId,
  getOfflineTileSourceRestriction,
} from '../tileCache'
import type { MapExtent } from '@/app/map/MapReactContext'

describe('tileCache — MapExtent bounds', () => {
  // Nairobi region — the shape shared with the offline downloader and getMapExtent().
  const nairobi: MapExtent = { minLat: -1.35, minLon: 36.7, maxLat: -1.15, maxLon: 36.95 }

  it('calculateTileCount uses the XYZ Web Mercator grid at Nairobi latitude', () => {
    // z=10, n=1024: the bounds span x=616..617 but stay within y=515.
    // The previous linear-latitude formula incorrectly counted two y rows.
    const { total } = calculateTileCount(nairobi, 10, 10)
    expect(total).toBe(2)
  })

  it('calculateTileCount sums across a zoom range', () => {
    // z=9 -> 1 tile; z=10 -> 2 tiles
    const { total } = calculateTileCount(nairobi, 9, 10)
    expect(total).toBe(3)
  })

  it('calculates standard XYZ tile coordinates and clamps the world edge', () => {
    expect(calculateTileBounds(-1.15, -1.35, 36.95, 36.7, 10)).toEqual({
      minX: 616,
      maxX: 617,
      minY: 515,
      maxY: 515,
    })
    expect(calculateTileBounds(90, -90, 180, -180, 0)).toEqual({
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    })
  })

  it('rejects invalid geographic extents and unsupported zoom ranges', () => {
    expect(() => calculateTileCount({ ...nairobi, maxLat: 91 }, 10, 10)).toThrow(/Latitude bounds/)
    expect(() => calculateTileCount({ ...nairobi, minLon: 37 }, 10, 10)).toThrow(/Longitude bounds/)
    expect(() => calculateTileCount(nairobi, 10, 21)).toThrow(/Zoom levels/)
  })

  it('accepts the shared MapExtent shape used by the offline flows', () => {
    const { total } = calculateTileCount(
      { minLat: -1, minLon: 36, maxLat: 0, maxLon: 37 },
      5,
      5,
    )
    expect(total).toBeGreaterThan(0)
  })

  it('estimateStorageSize varies by source type', () => {
    expect(estimateStorageSize(100, 'satellite')).toBe(4000000)
    expect(estimateStorageSize(100)).toBe(1500000)
  })

  it('downloadTilesForBounds fails closed when IndexedDB is unavailable', async () => {
    // Non-browser (jest) environment has no indexedDB, so the downloader must
    // report every tile as failed instead of throwing.
    const result = await downloadTilesForBounds(
      'osm',
      'https://tiles.example.com/{z}/{x}/{y}.png',
      nairobi,
      10,
      10,
      'custom',
      () => {},
    )
    expect(result.total).toBe(2)
    expect(result.failed).toBe(result.total)
    expect(result.downloaded).toBe(0)
  })

  it('rejects bulk offline downloads from the public OSM tile hosts', () => {
    expect(getOfflineTileSourceRestriction('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'))
      .toMatch(/does not allow bulk or offline downloads/i)
  })

  it('rejects direct bulk downloads from public Esri imagery, topo, and image-service hosts', () => {
    const publicEsriSources = [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      'https://services.arcgisonline.com/arcgis/rest/services/Sentinel2/ImageServer/tile/{z}/{y}/{x}',
    ]

    for (const source of publicEsriSources) {
      expect(getOfflineTileSourceRestriction(source)).toMatch(/blocks direct bulk downloads from Esri/i)
    }
  })

  it('allows an otherwise valid licensed or self-hosted XYZ source', () => {
    expect(getOfflineTileSourceRestriction('https://tiles.example.com/{z}/{x}/{y}.png')).toBeNull()
  })

  it('uses the same deterministic XYZ expansion and source identity in cache and map requests', () => {
    const template = 'https://{s}.tiles.example.com/{Z}/{X}/{Y}.png'
    expect(expandXyzTileUrl(template, 12, 2201, 1440))
      .toBe('https://c.tiles.example.com/12/2201/1440.png')
    expect(getTileSourceId(template)).toBe(getTileSourceId(template))
    expect(getTileSourceId(template)).not.toBe(getTileSourceId('https://tiles.example.com/{z}/{x}/{y}.png'))
  })

  it('blocks prohibited providers before opening the offline cache', async () => {
    await expect(downloadTilesForBounds(
      'osm',
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      nairobi,
      10,
      10,
      'osm',
      () => {},
    )).rejects.toThrow(/does not allow bulk or offline downloads/i)

    await expect(downloadTilesForBounds(
      'esri-topo',
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      nairobi,
      10,
      10,
      'custom',
      () => {},
    )).rejects.toThrow(/blocks direct bulk downloads from Esri/i)
  })
})
