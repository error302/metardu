import { z } from 'zod'
export const fieldProjectsSchema=z.object({
  projects:z.array(z.object({
    id:z.string().uuid(),name:z.string(),survey_type:z.string().nullable(),location:z.string().nullable(),
    created_at:z.string().datetime(),datum:z.string().nullable(),utm_zone:z.number().int().nullable(),
    hemisphere:z.string().nullable(),engineering_data:z.record(z.string(),z.unknown()).nullable(),reference_system:z.record(z.string(),z.unknown()).nullable(),
  })),
  hasMore:z.boolean(),
})

export type CollectionSurveyType = 'cadastral' | 'engineering' | 'topographic' | 'control'
/** Unknown survey profiles require an explicit workflow choice. */
export function collectionSurveyType(value: string | null | undefined): CollectionSurveyType | null {
  const type = value?.trim().toLowerCase().replace(/[ -]+/g, '_')
  if (['cadastral', 'boundary', 'boundary_survey', 'subdivision'].includes(type ?? '')) return 'cadastral'
  if (['topo', 'topographic', 'topographical'].includes(type ?? '')) return 'topographic'
  if (['engineering', 'road', 'road_survey', 'construction', 'as_built'].includes(type ?? '')) return 'engineering'
  if (['control', 'geodetic', 'control_survey'].includes(type ?? '')) return 'control'
  return null
}
