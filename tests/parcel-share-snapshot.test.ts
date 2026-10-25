/** @jest-environment node */
import { publicSnapshotFromExport } from '@/lib/scheme/parcelShareSnapshot'
import { hashSchemeValue } from '@/lib/scheme/exportArtifact'
import { hashDeliverableContent } from '@/lib/deliverables/deliverableRegister'
import { schemeExportSourceRevision } from '@/lib/scheme/exportContract'
import type { SchemeExportPacket } from '@/lib/scheme/exportCommands'
import { parcelShareReceiptSchema } from '@/lib/scheme/parcelShareContract'
jest.mock('@/lib/db', () => ({ db: {} }))
const sourceCrs = 'EPSG:32737'
const sourceHash = 'a'.repeat(64),
  sourceRevision = schemeExportSourceRevision(sourceHash)
const polygon = [
  [
    [39, -4],
    [39.001, -4],
    [39.001, -3.999],
    [39, -4],
  ],
]
function draftFixture() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'private-id',
        geometry: {
          type: 'Polygon',
          coordinates: polygon.map((ring) => ring.map((point) => [...point])),
        },
        properties: {
          parcelNumber: 'LOT 7',
          gridAreaSqM: 200,
          sourceCrs: 'EPSG:32737',
          assessment: 'unverified_draft',
          clientName: 'Private client',
          monument: 'FOUND',
        },
      },
    ],
    metardu: {
      protocol: 'scheme-boundary-export-v1',
      sourceHash,
      sourceRevision,
      sourceCrs: 'EPSG:32737',
      dimensions: 2,
      heights: 'not provided',
      professionalApproval: false,
      fieldVerified: false,
    },
  }
}
type Fixture = ReturnType<typeof draftFixture>
function packet(
  change: (value: Fixture) => void = () => {},
): SchemeExportPacket {
  const value = draftFixture()
  change(value)
  const bytes = Buffer.from(JSON.stringify(value))
  return {
    bytes,
    filename: 'draft.geojson',
    storagePath: 'private/path',
    contentHash: hashDeliverableContent(bytes),
    deliverableId: 'private',
    revisionId: 'private',
    revision: 2,
    requestId: 'private',
    requestHash: 'b'.repeat(64),
    sourceHash,
    sourceRevision,
    sourceCrs,
    outputCrs: 'EPSG:4326',
    replayed: true,
  }
}
it('shares only the reviewed geographic draft fields and exact retained provenance', () => {
  const result = publicSnapshotFromExport(packet())
  expect(result.parcels).toEqual([
    { label: 'LOT 7', gridAreaSqM: 200, coordinates: polygon },
  ])
  expect(result).toMatchObject({
    assessment: 'unverified_draft',
    sourceCrs,
    exportRevision: 2,
    professionalApproval: false,
    fieldVerified: false,
  })
  expect(JSON.stringify(result)).not.toMatch(
    /Private client|private-id|private\/path|monument|FOUND|licensed|certifiedDate/,
  )
  expect(hashSchemeValue(result)).toMatch(/^[a-f0-9]{64}$/)
})
it.each([
  [
    'unknown reference',
    (v: Fixture) => {
      v.metardu.sourceCrs = ''
    },
  ],
  [
    'changed source',
    (v: Fixture) => {
      v.metardu.sourceHash = 'c'.repeat(64)
    },
  ],
  [
    'unsupported height',
    (v: Fixture) => {
      v.features[0].geometry.coordinates[0][0].push(0)
    },
  ],
  [
    'non geographic coordinate',
    (v: Fixture) => {
      v.features[0].geometry.coordinates[0][0][0] = 500000
    },
  ],
  [
    'open polygon',
    (v: Fixture) => {
      v.features[0].geometry.coordinates[0].pop()
    },
  ],
  [
    'false field approval',
    (v: Fixture) => {
      v.metardu.fieldVerified = true
    },
  ],
] as const)(
  'refuses %s instead of substituting geometry or evidence',
  (_name, change) => {
    expect(() => publicSnapshotFromExport(packet(change))).toThrow()
  },
)
it('rejects corrupted retained bytes before disclosure', () => {
  const source = packet()
  source.bytes = Buffer.from('corrupt')
  expect(() => publicSnapshotFromExport(source)).toThrow()
})
it('rejects an access receipt that silently renews beyond the supported durations', () => {
  const receipt = {
    id: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    viewerId: '33333333-3333-4333-8333-333333333333',
    exportRequestId: '44444444-4444-4444-8444-444444444444',
    snapshotHash: 'a'.repeat(64),
    createdAt: '2026-10-25T00:00:00Z',
    expiresAt: '2026-11-25T00:00:00Z',
    revokedAt: null,
  }
  expect(parcelShareReceiptSchema.safeParse(receipt).success).toBe(false)
  expect(
    parcelShareReceiptSchema.safeParse({
      ...receipt,
      expiresAt: '2026-11-24T00:00:00Z',
    }).success,
  ).toBe(true)
})
