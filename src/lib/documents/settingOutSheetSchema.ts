import { z } from 'zod'
import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import type { SettingOutSheetData } from '@/lib/documents/templates/setting-out'

const baseText = (max: number) => z.string().trim().max(max)
const printableText = (max: number) => baseText(max).refine(
  value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  'Text contains unsupported control characters.',
)
const requiredText = (max: number, message: string) => baseText(max).min(1, message).refine(
  value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  'Text contains unsupported control characters.',
)

const optionalText = (max: number) => printableText(max).optional().transform(value => value || undefined)
const DECIMAL_NUMBER = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/

const settingOutPointSchema = z.object({
  pointId: requiredText(40, 'Point ID is required.'),
  designE: z.number().finite(),
  designN: z.number().finite(),
  bearing: optionalText(64),
  distance: optionalText(32).refine(value => value === undefined || (DECIMAL_NUMBER.test(value) && Number.isFinite(Number(value)) && Number(value) >= 0), 'Distance must be a non-negative decimal number in metres.'),
  offsetE: z.number().finite().optional(),
  offsetN: z.number().finite().optional(),
  toleranceCheck: optionalText(40),
  remarks: optionalText(200),
}).strict()

const validDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format.').refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Enter a valid calendar date.')

export const settingOutSheetRequestSchema = z.object({
  projectName: requiredText(120, 'Project name is required.'),
  surveyorName: requiredText(120, 'Surveyor name is required.'),
  surveyorLicense: requiredText(80, 'Surveyor registration is required.'),
  checkedByName: optionalText(120),
  checkedByLicense: optionalText(80),
  date: validDate,
  referenceStation: optionalText(80),
  instrument: optionalText(100),
  projection: requiredText(80, 'A declared project CRS is required.'),
  points: z.array(settingOutPointSchema).min(1).max(1_000),
}).strict().superRefine((data, context) => {
  const seen = new Set<string>()
  data.points.forEach((point, index) => {
    const key = point.pointId.toLocaleLowerCase('en-US')
    if (seen.has(key)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['points', index, 'pointId'], message: `Point ID “${point.pointId}” is duplicated.` })
    }
    seen.add(key)
  })
})

export type SettingOutSheetRequest = z.infer<typeof settingOutSheetRequestSchema>

export type PreparedSettingOutSheet =
  | { ok: true; data: SettingOutSheetData }
  | { ok: false; error: string }

/** Enforce the project's shared CRS and coordinate-range rules before formatting a sheet. */
export function prepareSettingOutSheet(input: unknown): PreparedSettingOutSheet {
  const parsed = settingOutSheetRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Setting-out sheet data is invalid.' }

  let crs: ReturnType<typeof assertProjectedCrs>
  try {
    crs = assertProjectedCrs(parsed.data.projection)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `${error.message} Coordinates are not transformed.` : 'Enter a registered projected metre CRS.',
    }
  }
  if (crs.units !== 'metres') return { ok: false, error: `${crs.code} is not a projected metre CRS.` }

  for (const point of parsed.data.points) {
    const range = validateCoordinateRange(point.designE, point.designN, crs.code)
    if (!range.valid) {
      return { ok: false, error: `Point ${point.pointId} is outside the declared ${crs.code} coordinate range: ${range.errors.join('; ')}` }
    }
  }

  return {
    ok: true,
    data: {
      ...parsed.data,
      projection: crs.code,
      datum: crs.datum,
    },
  }
}
