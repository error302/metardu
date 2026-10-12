import { z } from 'zod'
import type { CADDocument } from '@/components/cad-editor/CADEditor'

const finiteCoordinate = z.number().finite().min(-1_000_000_000).max(1_000_000_000)

/** Parse a complete decimal coordinate; never accept a numeric prefix or an empty value. */
export function parseCadGridCoordinate(input: string): number | undefined {
  const text = input.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return undefined
  const parsed = finiteCoordinate.safeParse(Number(text))
  return parsed.success ? parsed.data : undefined
}
const point = z.object({
  id: z.string().min(1).max(128),
  label: z.string().max(128),
  x: z.number().finite(),
  y: z.number().finite(),
  easting: finiteCoordinate.optional(),
  northing: finiteCoordinate.optional(),
  symbol: z.string().max(64).optional(),
  locked: z.boolean().optional(),
})

export const cadDocumentSchema = z.object({
  beacons: z.array(point).max(10_000),
  boundaries: z.array(z.object({
    id: z.string().min(1).max(128),
    fromId: z.string().min(1).max(128),
    toId: z.string().min(1).max(128),
    bearing: z.string().max(64),
    bearingDeg: z.number().finite().optional(),
    distance: z.string().max(64),
    distanceM: z.number().finite().nonnegative().optional(),
    type: z.enum(['standard', 'road', 'water', 'fence']),
    roadLabel: z.string().max(128).optional(),
  })).max(20_000),
  annotations: z.array(z.object({
    id: z.string().min(1).max(128),
    type: z.enum(['text', 'line']),
    x: z.number().finite(),
    y: z.number().finite(),
    text: z.string().max(2_000).optional(),
    fontSize: z.number().finite().positive().max(512).optional(),
    color: z.string().max(32).optional(),
    x2: z.number().finite().optional(),
    y2: z.number().finite().optional(),
  })).max(20_000),
  northArrow: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    rotation: z.number().finite(),
    type: z.enum(['grid', 'true', 'magnetic']),
    bearing: z.string().max(64),
  }),
  scaleBar: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    scaleMeters: z.number().finite().nonnegative().max(1_000_000),
  }),
  titleBlock: z.object({
    projectName: z.string().max(256),
    lrNumber: z.string().max(128),
    surveyor: z.string().max(256),
    regNo: z.string().max(128),
    date: z.string().max(64),
    scale: z.string().max(64),
    sheet: z.string().max(64),
  }),
  backgroundImage: z.object({
    id: z.string().min(1).max(128),
    url: z.string().max(6_000_000),
    name: z.string().max(256).optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive().max(20_000),
    height: z.number().finite().positive().max(20_000),
    opacity: z.number().finite().min(0).max(1),
    rotation: z.number().finite(),
    locked: z.boolean(),
    visible: z.boolean(),
  }).nullable().optional(),
  width: z.number().finite().positive().max(20_000),
  height: z.number().finite().positive().max(20_000),
  metersPerPixel: z.number().finite().positive().max(100_000).optional(),
  originEasting: finiteCoordinate.optional(),
  originNorthing: finiteCoordinate.optional(),
  coordinateReferenceSystem: z.string().trim().min(1).max(64).optional(),
}).superRefine((document, context) => {
  const beaconIds = new Set<string>()
  for (const beacon of document.beacons) {
    if (beaconIds.has(beacon.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['beacons'], message: `Duplicate beacon id: ${beacon.id}` })
    }
    beaconIds.add(beacon.id)
  }
  for (const [index, boundary] of document.boundaries.entries()) {
    if (boundary.fromId === boundary.toId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['boundaries', index], message: 'A boundary cannot connect a point to itself.' })
    }
    if (!beaconIds.has(boundary.fromId) || !beaconIds.has(boundary.toId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['boundaries', index], message: 'Boundary references a point that is not in this CAD document.' })
    }
  }
})

export function parseCadDocument(value: unknown): CADDocument | null {
  const parsed = cadDocumentSchema.safeParse(value)
  return parsed.success ? parsed.data as CADDocument : null
}
