import { z } from 'zod'

export const searchHitSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  snippet: z.string().optional(),
  score: z.number().finite(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export const searchResponseSchema = z.object({
  query: z.string(),
  total: z.number().int().nonnegative(),
  results: z.array(z.object({
    type: z.string(),
    total: z.number().int().nonnegative(),
    hits: z.array(searchHitSchema),
    unavailable: z.boolean().optional(),
  })),
})

export type SearchHit = z.infer<typeof searchHitSchema>
export type SearchResponse = z.infer<typeof searchResponseSchema>

/** Resolve only destinations that exist in the application. */
export function getSearchHitHref(hit: SearchHit): string | null {
  if (hit.type === 'projects') return `/project/${encodeURIComponent(hit.id)}`
  if (hit.type === 'submissions' && typeof hit.meta?.project_id === 'string' && hit.meta.project_id) {
    return `/project/${encodeURIComponent(hit.meta.project_id)}/submission`
  }
  if (hit.type === 'surveyors') return `/community/directory?q=${encodeURIComponent(hit.title)}`
  return null
}
