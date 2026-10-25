import { loadSchemeData } from '@/lib/map/schemeLayer'
import {
  schemeViewportSchema,
  schemeViewMessage,
} from '@/lib/scheme/schemeView'
import { ReadableStream as NodeReadableStream } from 'node:stream/web'
const project = '33333333-3333-4333-8333-333333333333'
const sourceCrs = 'EPSG:32737'
const oldFetch = global.fetch
afterEach(() => {
  global.fetch = oldFetch
})
it('refuses a legacy collection without a bound project identity', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      type: 'FeatureCollection',
      features: [],
      crs: { type: 'name', properties: { name: sourceCrs } },
    }),
  }) as unknown as typeof fetch
  await expect(loadSchemeData(project)).rejects.toThrow()
})
it('refuses nonfinite unvalidated geometry responses', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { type: 'parcel' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [NaN, 0],
                [1, 0],
                [0, 1],
                [NaN, 0],
              ],
            ],
          },
        },
      ],
      crs: { type: 'name', properties: { name: sourceCrs } },
    }),
  }) as unknown as typeof fetch
  await expect(loadSchemeData(project)).rejects.toThrow()
})
const frame = {
  projectId: project,
  projectName: 'SYNTHETIC geometry',
  crs: 'EPSG:32737',
  referenceHash: 'a'.repeat(64),
}
const bbox: [number, number, number, number] = [
  499900, 9499900, 500100, 9500100,
]
const parcel = '44444444-4444-4444-8444-444444444444',
  receipt = '55555555-5555-4555-8555-555555555555'
const extent = () => ({
  ...frame,
  mode: 'extent',
  extent: bbox,
  totalParcels: 20,
  geometryRecords: 1,
  missingGeometry: 19,
  otherReferenceRecords: 0,
  unplottableGeometry: 0,
})
const polygon = () => ({
  type: 'Feature',
  id: parcel,
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [500000, 9500000],
        [500010, 9500000],
        [500010, 9500020],
        [500000, 9500020],
        [500000, 9500000],
      ],
    ],
  },
  properties: {
    kind: 'parcel',
    parcelId: parcel,
    parcelNumber: 'SYN-A',
    blockId: null,
    blockNumber: null,
    recordedStatus: 'pending',
    suppliedAreaHa: '0.020000',
    gridAreaSqM: 200,
    evidenceState: 'reviewed_draft',
    receiptId: receipt,
    evidenceHash: 'b'.repeat(64),
    geometryHash: 'c'.repeat(64),
    revision: 1,
    updatedAt: '2026-10-25T00:00:01.123456Z',
    canSnap: true,
    assessment: 'unverified',
  },
})
const viewport = () => ({
  ...frame,
  type: 'FeatureCollection',
  mode: 'polygons',
  bbox,
  selection: null,
  matchingRecords: 1,
  representedRecords: 1,
  omittedRecords: 0,
  partial: false,
  history: 'available',
  features: [polygon()],
})
function fetched(value: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => value,
  }) as unknown as typeof fetch
}
it('loads a declared owner-bound extent without downloading parcel coordinates', async () => {
  fetched(extent())
  const value = await loadSchemeData(project)
  expect(value.totalParcels).toBe(20)
  expect(value.geometryRecords).toBe(1)
  expect(value.extent).toEqual(bbox)
})
it('rejects a successful reply for another project', async () => {
  fetched({ ...extent(), projectId: parcel })
  await expect(loadSchemeData(project)).rejects.toThrow(/selected project/)
})
it('loads exact viewport geometry in the declared reference', async () => {
  fetched(viewport())
  const value = await loadSchemeData(project, { bbox, cellSize: 20 })
  expect(value.features[0]).toMatchObject({
    id: parcel,
    properties: { canSnap: true, assessment: 'unverified' },
  })
})
it('rejects a reply for a different viewport', async () => {
  fetched({ ...viewport(), bbox: [0, 0, 1, 1] })
  await expect(loadSchemeData(project, { bbox, cellSize: 20 })).rejects.toThrow(
    /requested viewport/,
  )
})
it('rejects malformed geometry, counters and missing review identity', () => {
  const nonfinite = viewport()
  nonfinite.features[0].geometry.coordinates[0][0][0] = NaN
  expect(schemeViewportSchema.safeParse(nonfinite).success).toBe(false)
  expect(
    schemeViewportSchema.safeParse({ ...viewport(), representedRecords: 2 })
      .success,
  ).toBe(false)
  const noReceipt = viewport()
  noReceipt.features[0].properties.receiptId = null as unknown as string
  expect(schemeViewportSchema.safeParse(noReceipt).success).toBe(false)
})
it('rejects snapping claims for a stale or unassessed source', () => {
  for (const state of ['changed_since_review', 'unassessed_geometry']) {
    const value = viewport()
    value.features[0].properties.evidenceState = state
    expect(schemeViewportSchema.safeParse(value).success).toBe(false)
    value.features[0].properties.canSnap = false
    expect(schemeViewportSchema.safeParse(value).success).toBe(true)
  }
})
it('preserves the distinction between visual group coordinates and survey records', () => {
  const group = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [500005, 9500010] },
    properties: {
      kind: 'density',
      count: 100,
      extent: bbox,
      displayOnly: true,
      easting: 500005,
      parcelId: parcel,
      canSnap: true,
    },
  }
  const value = schemeViewportSchema.parse({
    ...viewport(),
    mode: 'density',
    features: [group],
    matchingRecords: 100,
    representedRecords: 100,
  })
  expect(value.features[0].properties).not.toHaveProperty('easting')
  expect(value.features[0].properties).not.toHaveProperty('parcelId')
  expect(value.features[0].properties).not.toHaveProperty('canSnap')
  expect(schemeViewMessage(value)).toMatch(/visual groups/)
})
it('labels partial views and unavailable history explicitly', () => {
  const item = polygon()
  item.properties.evidenceState = 'unassessed_geometry'
  item.properties.canSnap = false
  const value = schemeViewportSchema.parse({
    ...viewport(),
    features: [item],
    history: 'unavailable',
    matchingRecords: 2,
    omittedRecords: 1,
    partial: true,
  })
  expect(schemeViewMessage(value)).toMatch(/1 records are not drawn/)
  expect(schemeViewMessage(value)).toMatch(/history is unavailable/)
})
it('rejects geographic or display CRS declarations before drawing', async () => {
  for (const crs of ['EPSG:4326', 'EPSG:3857']) {
    fetched({ ...extent(), crs })
    await expect(loadSchemeData(project)).rejects.toThrow()
  }
})
it('cancels an oversized streamed response before JSON parsing', async () => {
  const canceled = jest.fn()
  const stream = new NodeReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(3145729))
    },
    cancel: canceled,
  })
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    body: stream as unknown as ReadableStream<Uint8Array>,
  }) as unknown as typeof fetch
  await expect(loadSchemeData(project)).rejects.toThrow(/3 MiB/)
  expect(canceled).toHaveBeenCalledTimes(1)
})
it('refuses snapping when review history or source hash is missing', () => {
  expect(
    schemeViewportSchema.safeParse({ ...viewport(), history: 'unavailable' })
      .success,
  ).toBe(false)
  const missing = viewport()
  missing.features[0].properties.evidenceHash = null as unknown as string
  expect(schemeViewportSchema.safeParse(missing).success).toBe(false)
})
it('refuses a reply beyond the complete viewport vertex budget', () => {
  const count = 4000,
    ring = Array.from({ length: count }, (_, i) => [
      500000 + 100 * Math.cos((i / count) * Math.PI * 2),
      9500000 + 100 * Math.sin((i / count) * Math.PI * 2),
    ])
  ring.push(ring[0])
  const features = Array.from({ length: 8 }, (_, i) => {
    const item = polygon(),
      id = `66666666-6666-4666-8666-${String(i).padStart(12, '0')}`
    item.id = id
    item.properties.parcelId = id
    item.geometry.coordinates = [ring]
    return item
  })
  expect(
    schemeViewportSchema.safeParse({
      ...viewport(),
      matchingRecords: 8,
      representedRecords: 8,
      features,
    }).success,
  ).toBe(false)
})
