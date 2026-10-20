import { z } from 'zod'

export const fieldBookControlSchema = z.object({
  name: z.string().trim().min(1).max(100),
  easting: z.number().finite(),
  northing: z.number().finite(),
  crs: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(2000).optional(),
})

export type FieldBookControl = z.infer<typeof fieldBookControlSchema>

export function startingControlFromBoundary(boundary: unknown): unknown {
  return boundary && typeof boundary === 'object' && !Array.isArray(boundary)
    ? (boundary as Record<string, unknown>).startControl ?? null : null
}
