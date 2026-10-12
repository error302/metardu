import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'
import { imageryCatalogueSchema, imageryDateRangeSchema, imageryDateSchema, type ImageryCatalogue, type ImageryProvider } from './satellite'

export const GIBS_CAPABILITIES_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml'
export const ESRI_METADATA_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=pjson'
const NASA_LAYER = 'MODIS_Terra_CorrectedReflectance_TrueColor'
const NASA_MATRIX = 'GoogleMapsCompatible_Level9'
const MAX_BYTES = 8 * 1024 * 1024
const WORLD_HALF_WIDTH = Math.PI * 6378137
const baseNasa = {
  id: 'nasa-modis-terra' as const, name: 'NASA MODIS / Terra true colour', dated: true,
  acquisitionDate: null, sourceResolution: '250 m visualization grid; native colour bands 250–500 m',
  credits: 'Imagery: NASA Global Imagery Browse Services (GIBS), ESDIS; MODIS / Terra',
  sourceUrl: 'https://nasa-gibs.github.io/gibs-api-docs/',
  termsUrl: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy',
  exportAllowed: true, exportReason: null,
}
const baseEsri = {
  id: 'esri-world' as const, name: 'Esri World Imagery', dated: false, acquisitionDate: null,
  sourceResolution: 'Varies by location; source pixel size and acquisition date are not established by this viewer',
  sourceUrl: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9',
  termsUrl: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9',
  exportAllowed: false,
  exportReason: 'This World Imagery service is intended for online viewing. Use a source licensed for raster/offline export for a GIS deliverable.',
}
const value = z.string()
const layerSchema = z.object({
  Identifier: value,
  Dimension: z.array(z.object({ Identifier: value, Default: value, Value: z.array(value) })),
  TileMatrixSetLink: z.array(z.object({ TileMatrixSet: value })),
  ResourceURL: z.array(z.object({ '@_template': value, '@_resourceType': value, '@_format': value })),
})
const matrixSchema = z.object({
  Identifier: value, SupportedCRS: value,
  TileMatrix: z.array(z.object({ Identifier: value, ScaleDenominator: value, TopLeftCorner: value, TileWidth: value, TileHeight: value, MatrixWidth: value, MatrixHeight: value })),
})

/** Parse the published WMTS declaration, without entity expansion or guessed dates. */
export function parseNasaImageryMetadata(xml: string): ImageryProvider {
  if (Buffer.byteLength(xml, 'utf8') > MAX_BYTES) throw new Error('Imagery metadata exceeds its size limit')
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('External XML declarations are not allowed')
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, processEntities: false,
    isArray: (name, path) => ['Layer', 'Dimension', 'Value', 'TileMatrixSetLink', 'ResourceURL', 'TileMatrix'].includes(name) || String(path) === 'Capabilities.Contents.TileMatrixSet',
  })
  const raw: unknown = parser.parse(xml, true)
  const contents = z.object({ Capabilities: z.object({ Contents: z.object({ Layer: z.array(z.unknown()), TileMatrixSet: z.array(z.unknown()) }) }) }).parse(raw).Capabilities.Contents
  const layer = layerSchema.parse(contents.Layer.find(item => z.object({ Identifier: z.literal(NASA_LAYER) }).safeParse(item).success))
  const matrix = matrixSchema.parse(contents.TileMatrixSet.find(item => z.object({ Identifier: z.literal(NASA_MATRIX) }).safeParse(item).success))
  if (!['urn:ogc:def:crs:EPSG::3857', 'urn:ogc:def:crs:EPSG:6.18:3:3857'].includes(matrix.SupportedCRS) || !layer.TileMatrixSetLink.some(link => link.TileMatrixSet === NASA_MATRIX)) throw new Error('The imagery tile grid is unsupported')
  const levels = matrix.TileMatrix.map(tile => {
    const level = z.coerce.number().int().min(0).max(9).parse(tile.Identifier)
    const corner = tile.TopLeftCorner.trim().split(/\s+/).map(Number), scale = Number(tile.ScaleDenominator)
    const expectedScale = 2 * WORLD_HALF_WIDTH / (256 * 0.00028 * 2 ** level)
    if (String(level) !== tile.Identifier || corner.length !== 2 || !corner.every(Number.isFinite) || Math.abs(corner[0] + WORLD_HALF_WIDTH) > 1e-4 || Math.abs(corner[1] - WORLD_HALF_WIDTH) > 1e-4 || !Number.isFinite(scale) || Math.abs(scale - expectedScale) > expectedScale * 1e-9 || tile.TileWidth !== '256' || tile.TileHeight !== '256' || Number(tile.MatrixWidth) !== 2 ** level || Number(tile.MatrixHeight) !== 2 ** level) throw new Error('The imagery tile grid is unsupported')
    return level
  })
  if (new Set(levels).size !== 10 || Math.min(...levels) !== 0 || Math.max(...levels) !== 9) throw new Error('The imagery tile grid is incomplete')
  const calendar = layer.Dimension.find(dimension => dimension.Identifier.toLowerCase() === 'time')
  if (!calendar) throw new Error('The imagery publication calendar is missing')
  const dateRanges = calendar.Value.map(period => {
    const parts = period.split('/')
    if (parts.length === 1) return imageryDateRangeSchema.parse({ start: parts[0], end: parts[0] })
    if (parts.length !== 3 || parts[2] !== 'P1D') throw new Error('Unsupported imagery calendar period')
    return imageryDateRangeSchema.parse({ start: parts[0], end: parts[1] })
  })
  const defaultDate = imageryDateSchema.parse(calendar.Default)
  if (!dateRanges.some(range => defaultDate >= range.start && defaultDate <= range.end)) throw new Error('The published default data day is outside the availability calendar')
  const template = layer.ResourceURL.find(resource => resource['@_resourceType'] === 'tile' && resource['@_format'] === 'image/jpeg' && resource['@_template'].includes('{Time}'))?.['@_template']
  const expected = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NASA_LAYER}/default/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpeg`
  if (template !== expected) throw new Error('The imagery tile template is unapproved')
  return { ...baseNasa, available: true, error: null, defaultDate, dateRanges, tileSize: 256, minZoom: 0, maxZoom: 9,
    tileTemplate: expected.replace('{TileMatrixSet}', NASA_MATRIX).replace('{TileMatrix}', '{z}').replace('{TileRow}', '{y}').replace('{TileCol}', '{x}'),
  }
}
function parseEsriMetadata(text: string): ImageryProvider {
  const metadata = z.object({ copyrightText: z.string().trim().min(1).max(5000), spatialReference: z.object({ latestWkid: z.literal(3857) }),
    tileInfo: z.object({ rows: z.literal(256), cols: z.literal(256), origin: z.object({ x: z.number().finite(), y: z.number().finite() }), lods: z.array(z.object({ level: z.number().int().min(0).max(24), resolution: z.number().finite().positive() })).min(1) }),
  }).parse(JSON.parse(text) as unknown)
  const levels = metadata.tileInfo.lods.map(lod => lod.level), maximum = Math.max(...levels)
  if (Math.abs(metadata.tileInfo.origin.x + WORLD_HALF_WIDTH) > 1e-4 || Math.abs(metadata.tileInfo.origin.y - WORLD_HALF_WIDTH) > 1e-4 || new Set(levels).size !== maximum + 1 || Math.min(...levels) !== 0 || metadata.tileInfo.lods.some(lod => Math.abs(lod.resolution - 2 * WORLD_HALF_WIDTH / (256 * 2 ** lod.level)) > lod.resolution * 1e-9)) throw new Error('The Esri imagery tile grid is unsupported')
  return { ...baseEsri, available: true, error: null, credits: metadata.copyrightText,
    tileTemplate: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256, minZoom: Math.min(...metadata.tileInfo.lods.map(lod => lod.level)), maxZoom: Math.min(20, Math.max(...metadata.tileInfo.lods.map(lod => lod.level))), defaultDate: null, dateRanges: [],
  }
}
async function readMetadata(url: string, request: typeof fetch): Promise<string> {
  const response = await request(url, { signal: AbortSignal.timeout(12000), credentials: 'omit', cache: 'no-store' })
  if (!response.ok) throw new Error(`Imagery metadata request failed (${response.status})`)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Imagery metadata response is empty')
  const chunks: Uint8Array[] = []; let total = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Imagery metadata exceeds its size limit') }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks).toString('utf8')
}

/** Fixed public endpoints only; successful reads are shared and cached for 15 minutes. */
export function createImageryCatalogueReader(request: typeof fetch = fetch, now = () => Date.now()) {
  let cached: { expiresAt: number; value: ImageryCatalogue } | null = null
  let pending: Promise<ImageryCatalogue> | null = null
  return function read(): Promise<ImageryCatalogue> {
    if (cached && cached.expiresAt > now()) return Promise.resolve(cached.value)
    if (pending) return pending
    pending = (async () => {
      const sources = await Promise.allSettled([readMetadata(ESRI_METADATA_URL, request).then(parseEsriMetadata), readMetadata(GIBS_CAPABILITIES_URL, request).then(parseNasaImageryMetadata)])
      const providers: ImageryProvider[] = sources.map((source, index) => source.status === 'fulfilled' ? source.value : {
        ...(index === 0 ? { ...baseEsri, credits: 'Esri World Imagery; credits unavailable until source metadata loads' } : baseNasa),
        available: false, error: `${index === 0 ? 'Esri' : 'NASA'} imagery metadata is unavailable. Retry loading the source.`,
        tileTemplate: null, tileSize: null, minZoom: null, maxZoom: null, defaultDate: null, dateRanges: [],
      })
      const catalogue = imageryCatalogueSchema.parse({ retrievedAt: new Date(now()).toISOString(), providers })
      if (providers.every(provider => provider.available)) cached = { expiresAt: now() + 15 * 60000, value: catalogue }
      return catalogue
    })().finally(() => { pending = null })
    return pending
  }
}
export const readImageryCatalogue = createImageryCatalogueReader()
