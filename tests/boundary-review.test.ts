import {
  prepareBoundary,
  boundaryCommandSchema,
  boundarySourceSchema,
  type BoundarySource,
} from '@/lib/scheme/boundaryReview'
import {
  createParcelFromTraverse,
  traversePointsToPolygon,
} from '@/lib/map/traverseToParcel'
const id = (n: number) =>
  `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const source: BoundarySource = {
  storageReady: true,
  observationCount: 0,
  projectId: id(1),
  parcelId: id(2),
  parcelNumber: 'SYN-A',
  blockId: null,
  parcelStatus: 'pending',
  parcelRevision: 0,
  traverseId: id(3),
  sourceCrs: 'EPSG:32737',
  evidenceHash: 'a'.repeat(64),
  points: [
    [500000, 9500000],
    [500010, 9500000],
    [500010, 9500020],
    [500000, 9500020],
  ].map(([easting, northing], i) => ({
    id: id(i + 10),
    station: `P${i}`,
    easting,
    northing,
    elevation: i === 0 ? 0 : null,
  })),
}
it('admits a complete filtered coordinate window without treating it as the full source', () => {
  const value = boundarySourceSchema.parse({
    ...source,
    pointWindow: {
      page: 1,
      pageSize: 50,
      total: 2001,
      matchingCount: 4,
      filter: 'P',
    },
  })
  expect(value.points).toHaveLength(4)
  expect(value.pointWindow?.total).toBe(2001)
})
it.each([
  { page: 0 },
  { page: 2 },
  { matchingCount: 5 },
  { total: 3 },
  { total: 2002 },
  { pageSize: 500 },
  { filter: 'x'.repeat(81) },
])('refuses inconsistent coordinate-window metadata %j', (change) => {
  expect(
    boundarySourceSchema.safeParse({
      ...source,
      pointWindow: {
        page: 1,
        pageSize: 50,
        total: 4,
        matchingCount: 4,
        filter: '',
        ...change,
      },
    }).success,
  ).toBe(false)
})
it('refuses duplicated coordinates in a transport window', () => {
  expect(
    boundarySourceSchema.safeParse({
      ...source,
      points: [source.points[0], source.points[0]],
      pointWindow: {
        page: 1,
        pageSize: 50,
        total: 2,
        matchingCount: 2,
        filter: '',
      },
    }).success,
  ).toBe(false)
})
it('uses reviewed IDs to form an analytical 200 square metre rectangle', () => {
  const result = prepareBoundary(
    source,
    [id(10), id(11), id(12), id(13)],
    source.sourceCrs,
  )
  expect(result.gridAreaSqM).toBe(200)
  expect(result.gridPerimeterM).toBe(60)
  expect(result.areaHa).toBe(0.02)
  expect(result.polygon.coordinates[0][4]).toEqual([500000, 9500000])
})
it('preserves fractional area at a large grid origin without hectare rounding', () => {
  const e = 250000,
    n = 9800000,
    width = 100 + 2 ** -23,
    height = 50 + 2 ** -20
  const precise = {
    ...source,
    points: [
      [e, n],
      [e + width, n],
      [e + width, n + height],
      [e, n + height],
    ].map(([easting, northing], i) => ({
      ...source.points[i],
      easting,
      northing,
    })),
  }
  const result = prepareBoundary(
    precise,
    precise.points.map((p) => p.id),
    source.sourceCrs,
  )
  const expected =
    (precise.points[1].easting - e) * (precise.points[2].northing - n)
  expect(result.gridAreaSqM).toBeCloseTo(expected, 9)
  expect(result.areaHa).toBe(expected / 10000)
})
it.each([
  ['crossed', [id(10), id(12), id(11), id(13)]],
  ['repeated', [id(10), id(11), id(10)]],
  ['foreign', [id(10), id(11), id(99)]],
])('refuses %s ring membership', (_name, ids) =>
  expect(() => prepareBoundary(source, ids, source.sourceCrs)).toThrow(),
)
const invalidGrids = ['EPSG:21037', 'EPSG:3857', 'EPSG:4326', '']
it.each(invalidGrids)('refuses an unadopted source grid %s', (crs) =>
  expect(() =>
    prepareBoundary(source, [id(10), id(11), id(12)], crs),
  ).toThrow(),
)
it('refuses a command without explicit review or repeated IDs', () => {
  expect(boundaryCommandSchema.safeParse({}).success).toBe(false)
  expect(
    boundaryCommandSchema.safeParse({
      parcel_id: id(1),
      traverse_id: id(2),
      request_id: id(3),
      evidence_hash: 'a'.repeat(64),
      source_crs: source.sourceCrs,
      ordered_coordinate_ids: [id(10), id(11), id(10)],
      reviewed: true,
      note: '',
    }).success,
  ).toBe(false)
})
it('refuses a nonfinite legacy polygon instead of manufacturing geometry', () =>
  expect(() =>
    traversePointsToPolygon([
      { easting: NaN, northing: 1, pointName: 'A' },
      { easting: 1, northing: 1, pointName: 'B' },
      { easting: 2, northing: 0, pointName: 'C' },
    ]),
  ).toThrow())

it.each([404, 500])(
  'a failed save (%s) cannot return a computed-only success or attempt a fallback route',
  async (status) => {
    const previous = global.fetch,
      request = {
        parcel_id: source.parcelId,
        traverse_id: source.traverseId,
        request_id: id(99),
        evidence_hash: source.evidenceHash,
        source_crs: source.sourceCrs,
        ordered_coordinate_ids: [id(10), id(11), id(12), id(13)],
        reviewed: true as const,
        note: '',
      }
    const mocked = jest
      .fn<
        Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>,
        [string, RequestInit?]
      >()
      .mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ error: 'SYNTHETIC persistence failed' }),
      })
    global.fetch = mocked as unknown as typeof fetch
    try {
      await expect(
        createParcelFromTraverse(source.projectId, source.parcelId, {
          command: request,
          source,
        }),
      ).rejects.toThrow('SYNTHETIC persistence failed')
      expect(mocked).toHaveBeenCalledTimes(1)
      expect(mocked.mock.calls[0][0]).toBe(
        `/api/project/${source.projectId}/scheme/parcel-boundary`,
      )
    } finally {
      global.fetch = previous
    }
  },
)

it('refuses implicit first-parcel persistence without an explicit reviewed source', async () => {
  const previous = global.fetch,
    mocked = jest.fn()
  global.fetch = mocked as typeof fetch
  try {
    await expect(
      createParcelFromTraverse(source.projectId, source.parcelId),
    ).rejects.toThrow(/Choose a parcel/)
    expect(mocked).not.toHaveBeenCalled()
  } finally {
    global.fetch = previous
  }
})
