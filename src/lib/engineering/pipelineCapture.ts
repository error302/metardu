/** Server archive contract. Raw measured input is retained; client results are never trusted. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { analyzePipelineAsBuilt } from './pipelineAsBuilt'
import { parsePipelineAsBuiltCsv } from './pipelineAsBuiltCsv'

const text = z.string().max(500)
export const PipelineCaptureInputSchema = z.object({
  rawCsv: z.string().min(1).max(1_000_000),
  metadata: z.object({ route: text, designReference: text, verticalReference: text, observer: text, instrument: text }).strict(),
  criterion: z.object({ minimumCoverM: z.number().finite().positive(), source: text.trim().min(1), revision: text.trim().min(1) }).strict().nullable(),
}).strict()
export const SavePipelineCaptureSchema = PipelineCaptureInputSchema.extend({ clientBatchId: z.string().uuid() }).strict()
export type PipelineCaptureInput = z.infer<typeof PipelineCaptureInputSchema>
export function createPipelineCapture(raw: unknown) {
  const input = PipelineCaptureInputSchema.parse(raw)
  const result = analyzePipelineAsBuilt(parsePipelineAsBuiltCsv(input.rawCsv), input.criterion)
  const canonical = { rawCsv: input.rawCsv, metadata: input.metadata, criterion: input.criterion }
  const inputHash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
  return { inputHash, capture: { schemaVersion: 1 as const, scope: 'numerical_profile_only' as const, ...canonical, result } }
}
export type PipelineCapture = ReturnType<typeof createPipelineCapture>['capture']
export interface SavedPipelineBatch {
  id: string
  project_id: string
  actor_id: string
  client_batch_id: string
  input_hash: string
  capture: PipelineCapture
  project_name: string
  /** Saved project declaration at recording; not proof that measured levels use it. */
  reference_snapshot: Record<string, unknown> | null
  recorded_at: string
}
export interface PipelineHistorySummary {
  id: string
  recorded_at: string
  route: string
  point_count: number
  algorithm_version: string
}
function ordered(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(ordered).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${ordered((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}
/** Check archive integrity without silently upgrading historical algorithms. */
export function assertPipelineCapture(capture: unknown, inputHash: string): PipelineCapture {
  if (!capture || typeof capture !== 'object') throw new Error('Invalid retained pipeline capture.')
  const record = capture as Record<string, unknown>
  const recomputed = createPipelineCapture({ rawCsv: record.rawCsv, metadata: record.metadata, criterion: record.criterion })
  if (inputHash !== recomputed.inputHash || ordered(record) !== ordered(recomputed.capture)) throw new Error('The retained pipeline capture does not match its input hash and supported calculation version. It was left unchanged.')
  return capture as PipelineCapture
}
