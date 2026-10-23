import { z } from 'zod'
import { assertProjectedCrs, CrsError } from './projectCrs'
import type { ProjectReferenceSystemRecord } from './projectReferenceSystem'

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

/** Blank is unknown; supplied malformed values must never become unknown or zero. */
export function referenceNumber(value: unknown, label: string): number | undefined {
  if (value == null || typeof value === 'string' && !value.trim()) {
    return undefined
  }
  if (typeof value !== 'number' && typeof value !== 'string'
    || typeof value === 'string' && !DECIMAL.test(value.trim()) || !Number.isFinite(Number(value))) {
    throw new CrsError('CRS_INVALID', `${label} must be a finite decimal number.`)
  }
  return Number(value)
}

export function requiredReferenceNumber(value: unknown, label: string): number {
  const parsed = referenceNumber(value, label)
  if (parsed === undefined) throw new CrsError('CRS_INVALID', `${label} is required.`)
  return parsed
}

export function referenceText(value: unknown, label: string): string | undefined {
  if (value == null) return undefined
  if (typeof value !== 'string') throw new CrsError('CRS_INVALID', `${label} must be text.`)
  return value.trim() || undefined
}

const optionalText = z.string().optional()
const recordSchema = z.object({
  prs: z.object({
    horizontalCrs: z.string().min(1), horizontalName: z.string().min(1), datum: z.string().min(1),
    units: z.literal('metres'), zone: z.number().int().optional(), hemisphere: z.enum(['N','S']).optional(),
    verticalDatum: optionalText, verticalReference: z.enum(['orthometric','ellipsoidal','trig','local']).optional(),
    distanceMode: z.enum(['grid','ground']), combinedScaleFactor: z.number().finite().positive().optional(),
    coordinatePrecision: z.number().int().min(0).max(6), angularUnit: z.literal('degrees'), notes: optionalText,
  }),
  geoidModel: optionalText, benchmarkBasis: optionalText, calibrationVersion: optionalText, calibrationNotes: optionalText,
  csfProvenance: z.enum(['computed','surveyor']).optional(),
  csfReference: z.object({ easting: z.number().finite(), northing: z.number().finite(), height: z.number().finite().optional() }).optional(),
  declaredBy: z.string().nullable().optional(), declaredAt: z.string().nullable().optional(),
})
const responseSchema = z.object({ referenceSystem: recordSchema.nullable(), description: z.array(z.string()).optional() })

export function readReferenceResponse(value: unknown, requireSaved = false): { referenceSystem: ProjectReferenceSystemRecord | null; description: string[] } {
  const parsed = responseSchema.safeParse(value)
  if (!parsed.success || requireSaved && !parsed.data.referenceSystem) throw new Error('The reference-system response was not confirmed. Your entries are retained.')
  const record = parsed.data.referenceSystem
  if (record) {
    const info = assertProjectedCrs(record.prs.horizontalCrs)
    if (info.units !== 'metres' || info.zone != null && record.prs.zone !== info.zone
      || info.hemisphere && record.prs.hemisphere !== info.hemisphere
      || record.declaredAt && !Number.isFinite(Date.parse(record.declaredAt))) {
      throw new Error('The reference-system response is inconsistent with its CRS authority.')
    }
  }
  return { referenceSystem: record, description: parsed.data.description ?? [] }
}
