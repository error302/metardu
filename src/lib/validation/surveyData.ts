/**
 * Coordinate & survey data validation with Zod.
 * Kenya bounding box (Arc 1960 / UTM Zone 37S, SRID 21037).
 * 
 * CRITICAL INVARIANT: Levelling closure tolerance is 10√K mm (RDM 1.1, Table 5.1, 2025).
 * 12√K is WRONG and must never appear in computation modules.
 */
import { z } from 'zod'

const KENYA_EASTING_RANGE = { min: 166000, max: 1066000 }
const KENYA_NORTHING_RANGE = { min: 9140000, max: 10200000 }

export const CoordinateSchema = z.object({
  point_id: z.string().max(50),
  easting: z.number()
    .min(KENYA_EASTING_RANGE.min, `Easting must be >= ${KENYA_EASTING_RANGE.min} (Kenya bounds)`)
    .max(KENYA_EASTING_RANGE.max, `Easting must be <= ${KENYA_EASTING_RANGE.max} (Kenya bounds)`),
  northing: z.number()
    .min(KENYA_NORTHING_RANGE.min, `Northing must be >= ${KENYA_NORTHING_RANGE.min} (Kenya bounds)`)
    .max(KENYA_NORTHING_RANGE.max, `Northing must be <= ${KENYA_NORTHING_RANGE.max} (Kenya bounds)`),
  elevation: z.number().min(-100).max(6000).optional(),
  srid: z.literal(21037).default(21037),
})

export const CreateProjectSchema = z.object({
  name: z.string().min(3).max(200).trim(),
  survey_type: z.enum([
    'cadastral_subdivision', 'cadastral_amalgamation', 'cadastral_resurvey', 'cadastral_mutation',
    'engineering_road', 'engineering_bridge', 'engineering_dam', 'engineering_pipeline',
    'engineering_railway', 'engineering_building', 'engineering_tunnel',
    'topographic', 'geodetic', 'mining', 'hydrographic', 'drone_uav', 'deformation_monitoring',
  ]),
  county: z.string().max(100).trim().optional(),
  description: z.string().max(2000).trim().optional(),
})

export const LevellingObservationSchema = z.object({
  benchmark_id: z.string().max(50),
  rl: z.number(),
  distance_km: z.number().positive(),
})

export function validateCoordinates(data: unknown) {
  return CoordinateSchema.safeParse(data)
}
