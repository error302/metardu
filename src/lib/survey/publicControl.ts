import { z } from 'zod'
import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'

export interface PublicControlRow extends Record<string, unknown> {
  id: string; name: string; beacon_type: string; easting: number; northing: number;
  elevation: number | null; horizontal_crs: string | null; vertical_datum: string | null;
  source_reference: string | null; authority: string | null; country: string | null;
  description: string | null; submitted_by: string | null; status: string;
  verified_by: string | null; verified_at: Date | null; snapshot: Record<string, unknown>;
}

export const publicControlSchema = z.object({
  name: z.string().trim().min(1).max(100),
  beaconType: z.enum(['trig', 'control', 'boundary', 'benchmark', 'gnss', 'tidal', 'other']),
  easting: z.number().finite(), northing: z.number().finite(),
  elevation: z.number().finite().min(-10000).max(100000).nullable().prefault(null),
  horizontalCrs: z.string().trim().min(1).max(64),
  verticalDatum: z.string().trim().min(1).max(120).nullable().prefault(null),
  sourceReference: z.string().trim().min(5).max(2000),
  authority: z.string().trim().min(1).max(200), country: z.string().trim().min(1).max(100),
  description: z.string().trim().max(4000).prefault(''),
}).strict().superRefine((value, ctx) => {
  try {
    const info = assertProjectedCrs(value.horizontalCrs)
    if (info.units !== 'metres') throw new Error('Use a projected metre grid')
    const range = validateCoordinateRange(value.easting, value.northing, info.code)
    if (!range.valid) throw new Error(range.errors.join('; '))
  } catch (error) { ctx.addIssue({code:'custom',path:['horizontalCrs'],message:error instanceof Error ? error.message : 'Invalid survey grid'}) }
  if (value.elevation !== null && !value.verticalDatum) ctx.addIssue({code:'custom',path:['verticalDatum'],message:'A published height requires its vertical datum'})
})

/** Exact reference agreement. Importing a catalogue coordinate performs no datum transformation. */
export function assertControlImportReference(source: { horizontal_crs: string | null; elevation: number | null; vertical_datum: string | null }, project: {code: string | null; source: string; verticalDatum: string | null}): void {
  if (!project.code || project.source !== 'declared') throw new Error('Declare the project reference system before importing control')
  if (!source.horizontal_crs || assertProjectedCrs(source.horizontal_crs).code !== project.code) throw new Error('The source and project horizontal grids must match; use an evidenced transformation workflow for a different grid')
  if (source.elevation !== null && (!source.vertical_datum || source.vertical_datum !== project.verticalDatum)) throw new Error('The source height datum must match the project vertical datum')
}
