import {
  fromReferenceSystemRow,
  resolveProjectReference,
  toReferenceSystemRow,
  type ProjectReferenceSystemRecord,
} from '@/lib/spatial/projectReferenceSystem'

export type StageReference =
  | { code: string; name: string; source: 'declared' | 'legacy'; hemisphere: 'N' | 'S' | null; verticalDatum: string | null; distanceMode: 'grid' | 'ground' | null }
  | { code: null; name: 'Reference system not set'; source: 'missing'; hemisphere: null; verticalDatum: null; distanceMode: null }

interface LegacyProjectReference {
  datum?: string | null
  utm_zone?: number | null
  hemisphere?: string | null
}

const MISSING: StageReference = {
  code: null,
  name: 'Reference system not set',
  source: 'missing',
  hemisphere: null,
  verticalDatum: null,
  distanceMode: null,
}

/** Adapt the dedicated API's declared record through the existing CRS authority. */
export function resolveDeclaredStageReference(value: unknown): StageReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return MISSING
  const record = value as ProjectReferenceSystemRecord
  if (!record.prs || typeof record.prs !== 'object' || record.prs.units !== 'metres') return MISSING
  try { return resolveStageReference(toReferenceSystemRow('', record, null), {}) }
  catch { return MISSING }
}

/** Use the saved declaration first. Legacy project fields are labelled as such. */
export function resolveStageReference(
  row: Record<string, unknown> | null | undefined,
  project: LegacyProjectReference,
): StageReference {
  // ONE resolution core: src/lib/spatial/projectReferenceSystem.ts decides what
  // a project may use and how it was derived. This adapter only adds the
  // stage-specific extras (vertical datum, distance mode) and the wording.
  if (row) {
    try {
      const record = fromReferenceSystemRow(row)
      if (!record) return MISSING
      const resolution = resolveProjectReference({ declaredCrs: record.prs.horizontalCrs })
      if (!resolution.ok) return MISSING
      const reference = resolution.reference
      // A declaration whose stored zone/hemisphere contradicts the authority
      // is corrupt, not a reason to fall back to a guessed zone.
      if (record.prs.zone != null && reference.zone !== record.prs.zone) return MISSING
      if (record.prs.hemisphere && reference.hemisphere !== record.prs.hemisphere) return MISSING
      return {
        code: reference.horizontalCrs,
        name: reference.name,
        source: 'declared',
        hemisphere: reference.hemisphere,
        verticalDatum: record.prs.verticalDatum ?? null,
        distanceMode: record.prs.distanceMode,
      }
    } catch {
      // A corrupt saved declaration must not be replaced by a guessed zone.
      return MISSING
    }
  }

  const resolution = resolveProjectReference({
    zone: project.utm_zone,
    hemisphere: project.hemisphere,
    datum: project.datum,
  })
  if (!resolution.ok) return MISSING
  const reference = resolution.reference
  return {
    code: reference.horizontalCrs,
    name: reference.name,
    source: 'legacy',
    hemisphere: reference.hemisphere,
    verticalDatum: null,
    distanceMode: null,
  }
}

