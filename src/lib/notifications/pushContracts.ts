import { z } from 'zod'
export const pushConfigSchema=z.object({
  available:z.boolean(),publicKey:z.string().nullable(),
  runner:z.object({running:z.boolean(),lastRunAt:z.string().nullable(),lastError:z.string().nullable()}),
})
export const pushDeviceSchema=z.object({enabled:z.boolean(),lastAcceptedAt:z.string().nullable().optional()})
export type PushConfig= z.infer<typeof pushConfigSchema>
