import { z } from 'zod'

export const BoundaryPointSchema = z.object({
  name: z.string().min(1),
  easting: z.number(),
  northing: z.number(),
})

export const ControlPointSchema = BoundaryPointSchema.extend({
  elevation: z.number().optional(),
  monumentType: z.enum(['found', 'set', 'masonry_nail', 'iron_pin', 'indicatory_beacon']),
  beaconDescription: z.string().optional(),
})

export const RevisionEntrySchema = z.object({
  rev: z.string(),
  date: z.string(),
  description: z.string(),
  by: z.string(),
})

export const BearingEntrySchema = z.object({
  from: z.string(),
  to: z.string(),
  bearing: z.string(),
  distance: z.number(),
})

export const SurveyPlanDataSchema = z.object({
  project: z.object({
    name: z.string().min(3),
    location: z.string(),
    municipality: z.string().optional(),
    utm_zone: z.number().int().min(1).max(60),
    hemisphere: z.enum(['N', 'S']),
    datum: z.enum(['ARC1960', 'WGS84', 'WGS84Geographic']).optional(),
    client_name: z.string().optional(),
    surveyor_name: z.string().optional(),
    surveyor_licence: z.string().optional(),
    firm_name: z.string().optional(),
    firm_address: z.string().optional(),
    firm_phone: z.string().optional(),
    firm_email: z.string().email().optional().or(z.literal('')),
    drawing_no: z.string().optional(),
    reference: z.string().optional(),
    plan_title: z.string().optional(),
    area_sqm: z.number().nonnegative().optional(),
    area_ha: z.number().nonnegative().optional(),
    parcel_id: z.string().optional(),
    street: z.string().optional(),
    road_class: z.string().optional(),
    northRotationDeg: z.number().optional(),
    sheetNo: z.string().optional(),
    totalSheets: z.string().optional(),
    revisions: z.array(RevisionEntrySchema).optional(),
    bearingSchedule: z.array(BearingEntrySchema).optional(),
    hundred: z.string().optional(),
    iskRegNo: z.string().optional(),
  }),
  parcel: z.object({
    boundaryPoints: z.array(BoundaryPointSchema).min(3, "A parcel must have at least 3 boundary points"),
    area_sqm: z.number().nonnegative(),
    perimeter_m: z.number().nonnegative(),
    pin: z.string().optional(),
    parts: z.array(z.string()).optional(),
  }),
  controlPoints: z.array(ControlPointSchema),
  fenceOffsets: z.array(z.object({
    segmentIndex: z.number().int().nonnegative(),
    type: z.enum(['fence_on_boundary', 'chain_link', 'board_fence', 'iron_fence', 'galv_iron', 'no_fence', 'end_of_fence', 'end_of_bf']),
    offsetMetres: z.number(),
  })).optional(),
  adjacentLots: z.array(z.object({
    id: z.string(),
    boundaryPoints: z.array(z.object({ easting: z.number(), northing: z.number() })),
    planReference: z.string().optional(),
  })).optional(),
})

export type ValidatedSurveyPlanData = z.infer<typeof SurveyPlanDataSchema>
