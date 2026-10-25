import { AppError } from '@/lib/api/errors'
import { z } from 'zod'
import { hashDeliverableContent } from '@/lib/deliverables/deliverableRegister'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { schemeExportSourceRevision } from './exportContract'
import type { SchemeExportPacket } from './exportCommands'
import {
  PARCEL_SHARE_BYTES,
  parcelShareSnapshotSchema,
  type ParcelShareSnapshot,
} from './parcelShareContract'
export function publicSnapshotFromExport(
  packet: SchemeExportPacket,
): ParcelShareSnapshot {
  try {
    if (
      packet.bytes.length > PARCEL_SHARE_BYTES ||
      hashDeliverableContent(packet.bytes) !== packet.contentHash ||
      packet.outputCrs !== 'EPSG:4326' ||
      packet.sourceRevision !== schemeExportSourceRevision(packet.sourceHash)
    )
      throw new Error('Invalid artifact')
    assertProjectedCrs(packet.sourceCrs)
    const value = z
      .object({
        type: z.literal('FeatureCollection'),
        features: z
          .array(
            z.object({
              type: z.literal('Feature'),
              geometry: z.object({
                type: z.literal('Polygon'),
                coordinates: z.unknown(),
              }),
              properties: z.object({
                parcelNumber: z.string(),
                gridAreaSqM: z.number(),
                sourceCrs: z.literal(packet.sourceCrs),
                assessment: z.literal('unverified_draft'),
              }),
            }),
          )
          .min(1)
          .max(50),
        metardu: z.object({
          protocol: z.literal('scheme-boundary-export-v1'),
          sourceHash: z.literal(packet.sourceHash),
          sourceRevision: z.literal(packet.sourceRevision),
          sourceCrs: z.literal(packet.sourceCrs),
          dimensions: z.literal(2),
          heights: z.literal('not provided'),
          professionalApproval: z.literal(false),
          fieldVerified: z.literal(false),
        }),
      })
      .parse(JSON.parse(packet.bytes.toString('utf8')))
    const snapshot = parcelShareSnapshotSchema.parse({
      protocol: 'parcel-draft-share-v1',
      assessment: 'unverified_draft',
      sourceCrs: packet.sourceCrs,
      sourceHash: packet.sourceHash,
      sourceRevision: packet.sourceRevision,
      artifactHash: packet.contentHash,
      exportRevision: packet.revision,
      dimensions: 2,
      heights: 'not provided',
      professionalApproval: false,
      fieldVerified: false,
      parcels: value.features.map((feature) => ({
        label: feature.properties.parcelNumber,
        gridAreaSqM: feature.properties.gridAreaSqM,
        coordinates: feature.geometry.coordinates,
      })),
    })
    if (Buffer.byteLength(JSON.stringify(snapshot)) > PARCEL_SHARE_BYTES - 4096)
      throw new Error('Oversized snapshot')
    return snapshot
  } catch {
    throw new AppError(
      'The retained geographic draft failed its sharing checks. No substitute geometry was used.',
      409,
    )
  }
}
