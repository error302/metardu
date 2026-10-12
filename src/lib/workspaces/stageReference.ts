import { resolveEpsg } from '@/lib/spatial/projectCrs'
import { fromReferenceSystemRow, horizontalCrsFor } from '@/lib/spatial/projectReferenceSystem'

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

/** Use the saved declaration first. Legacy project fields are labelled as such. */
export function resolveStageReference(
  row: Record<string, unknown> | null | undefined,
  project: LegacyProjectReference,
): StageReference {
  if (row) {
    try {
      const record = fromReferenceSystemRow(row)
      if (!record) return MISSING
      const info = resolveEpsg(record.prs.horizontalCrs)
      if (!info.projected || info.displayOnly || info.units !== 'metres') return MISSING
      if (record.prs.zone != null && info.zone != null && record.prs.zone !== info.zone) return MISSING
      if (record.prs.hemisphere && info.hemisphere && record.prs.hemisphere !== info.hemisphere) return MISSING
      return {
        code: info.code,
        name: info.name,
        source: 'declared',
        hemisphere: info.hemisphere ?? null,
        verticalDatum: record.prs.verticalDatum ?? null,
        distanceMode: record.prs.distanceMode,
      }
    } catch {
      // A corrupt saved declaration must not be replaced by a guessed zone.
      return MISSING
    }
  }

  const { datum, utm_zone: zone, hemisphere } = project
  if (!datum || zone == null || (hemisphere !== 'N' && hemisphere !== 'S')) return MISSING
  try {
    const info = resolveEpsg(horizontalCrsFor(datum, zone, hemisphere))
    if (!info.projected || info.displayOnly || info.units !== 'metres') return MISSING
    return {
      code: info.code,
      name: info.name,
      source: 'legacy',
      hemisphere: info.hemisphere ?? null,
      verticalDatum: null,
      distanceMode: null,
    }
  } catch {
    return MISSING
  }
}

