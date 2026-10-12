import { z } from 'zod'
import { MAX_PIPE_SETOUT_STATIONS, type Manhole, type Pipe } from './pipeNetworkEngine'

const pipeNetworkManholeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  easting: z.number().finite().optional(),
  northing: z.number().finite().optional(),
  groundLevel: z.number().finite().optional(),
  invertIn: z.number().finite().optional(),
  invertOut: z.number().finite().optional(),
  junctionLossK: z.number().finite().min(0).optional(),
}).strict()

const pipeNetworkPipeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  fromId: z.string().trim().min(1).max(120),
  toId: z.string().trim().min(1).max(120),
  diameterMm: z.number().finite().min(0),
  outsideDiameterMm: z.number().finite().positive().optional(),
  material: z.enum(['Concrete', 'HDPE', 'uPVC', 'Corrugated Metal']),
  manningN: z.number().finite().positive().optional(),
  designFlowLs: z.number().finite().min(0),
  alignmentVertices: z.array(z.object({
    easting: z.number().finite(),
    northing: z.number().finite(),
  }).strict()).max(20_000).optional(),
}).strict()

export const PipeNetworkProjectSchema = z.object({
  version: z.literal(1),
  projectCrs: z.string().trim().min(1).max(100),
  minimumCoverM: z.number().finite().positive().optional(),
  stationIntervalM: z.number().finite().positive().optional(),
  stationStartChainageM: z.number().finite().optional(),
  outfallHglM: z.number().finite().optional(),
  manholes: z.array(pipeNetworkManholeSchema).max(1_000),
  pipes: z.array(pipeNetworkPipeSchema).max(999),
}).strict().superRefine((network, context) => {
  const bendCount = network.pipes.reduce((count, pipe) => count + (pipe.alignmentVertices?.length ?? 0), 0)
  if (bendCount > MAX_PIPE_SETOUT_STATIONS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pipes'],
      message: `A project network can store at most ${MAX_PIPE_SETOUT_STATIONS.toLocaleString()} route bend points in total.`,
    })
  }
})

export type PipeNetworkProjectData = z.infer<typeof PipeNetworkProjectSchema>

/** Preserve the calculation-engine entities exactly when moving them into a project record. */
export function createPipeNetworkProjectData(input: {
  projectCrs: string
  minimumCoverM?: number
  stationIntervalM?: number
  stationStartChainageM?: number
  outfallHglM?: number
  manholes: Manhole[]
  pipes: Pipe[]
}): PipeNetworkProjectData {
  return PipeNetworkProjectSchema.parse({ version: 1, ...input })
}
