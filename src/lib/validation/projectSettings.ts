import { z } from 'zod'
import { referenceNumber } from '@/lib/spatial/referenceDeclaration'

const text = z.string().max(4000).nullable().optional()
/** Project metadata cannot change the reference declaration, ownership or engineering JSON. */
export const projectSettingsPatchSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(500).optional(),
  location: text, survey_type: z.string().trim().min(1).max(100).optional(),
  road_class: text, terrain_type: text, client_name: text, surveyor_name: text,
  road_name: text, start_chainage: z.number().finite().nullable().optional(),
  linear_error_m: z.number().finite().nonnegative('Closure error cannot be negative').nullable().optional(),
  folio_number: text, register_number: text, lr_number: text, plot_parcel_number: text,
  registration_district: text, locality: text,
}).strict().refine(value => Object.keys(value).length > 0, 'No project details changed')

export type ProjectSettingsPatch = z.infer<typeof projectSettingsPatchSchema>
export type ProjectSettingsDraft = Record<keyof ProjectSettingsPatch, string>

/** Compare raw drafts first: an unrelated edit must not rewrite unknown or stale evidence. */
export function changedProjectSettings(draft: ProjectSettingsDraft, baseline: ProjectSettingsDraft): ProjectSettingsPatch | null {
  const patch: Record<string, string | number | null> = {}
  for (const key of Object.keys(draft) as (keyof ProjectSettingsDraft)[]) {
    if (draft[key] === baseline[key]) continue
    if (key === 'linear_error_m' || key === 'start_chainage') {
      patch[key] = referenceNumber(draft[key], key === 'linear_error_m' ? 'Closure error' : 'Start chainage') ?? null
    } else {
      patch[key] = key === 'name' || key === 'survey_type' ? draft[key] : draft[key] || null
    }
  }
  if (!Object.keys(patch).length) return null
  const parsed = projectSettingsPatchSchema.safeParse(patch)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the changed project details.')
  return parsed.data
}
