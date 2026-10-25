import {
  schemeExtentSchema,
  schemeViewportSchema,
} from '@/lib/scheme/schemeView'
export const schemeProject = '33333333-3333-4333-8333-333333333333'
export const schemeCrs = 'EPSG:32737'
export const schemeBbox: [number, number, number, number] = [
  499900, 9499900, 500100, 9500100,
]
const frame = {
  projectId: schemeProject,
  projectName: 'SYNTHETIC geometry',
  crs: schemeCrs,
  referenceHash: 'a'.repeat(64),
}
export function schemeExtent() {
  return schemeExtentSchema.parse({
    ...frame,
    mode: 'extent',
    extent: schemeBbox,
    totalParcels: 10000,
    geometryRecords: 10000,
    missingGeometry: 0,
    otherReferenceRecords: 0,
    unplottableGeometry: 0,
  })
}
export function schemeViewport(bbox = schemeBbox) {
  const id = '44444444-4444-4444-8444-444444444444'
  return schemeViewportSchema.parse({
    ...frame,
    mode: 'polygons',
    type: 'FeatureCollection',
    bbox,
    selection: null,
    matchingRecords: 1,
    representedRecords: 1,
    omittedRecords: 0,
    partial: false,
    history: 'available',
    features: [
      {
        type: 'Feature',
        id,
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
          parcelId: id,
          parcelNumber: 'SYN-A',
          blockId: null,
          blockNumber: null,
          recordedStatus: 'pending',
          suppliedAreaHa: '0.020000',
          gridAreaSqM: 200,
          evidenceState: 'reviewed_draft',
          receiptId: '55555555-5555-4555-8555-555555555555',
          evidenceHash: 'b'.repeat(64),
          geometryHash: 'c'.repeat(64),
          revision: 1,
          updatedAt: '2026-10-25T00:00:01.123456Z',
          canSnap: true,
          assessment: 'unverified',
        },
      },
    ],
  })
}
