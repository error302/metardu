import { z } from 'zod'

/** Measurements only: a valid relative status is not independent field proof. */
export const RelativeBaselineResultSchema = z.object({
  rover_latitude: z.number().finite().min(-90).max(90),
  rover_longitude: z.number().finite().min(-180).max(180),
  rover_height: z.number().finite(),
  sigma_north: z.number().finite().nonnegative(),
  sigma_east: z.number().finite().nonnegative(),
  sigma_up: z.number().finite().nonnegative(),
  quality: z.enum(['FIX', 'FLOAT']),
  sat_count: z.number().finite().int().positive(),
  ratio: z.number().finite().nonnegative(),
})
