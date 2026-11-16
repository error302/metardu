/**
 * Field-capture feature codes.
 *
 * One vocabulary, one source of truth: KENYA_FIELD_CODE_TABLE already drives
 * field-to-finish linework and the 45-layer DXF standard, so the code a crew
 * picks on site now determines the layer the office gets. The collector used to
 * offer seven hard-coded labels that were not in that table, so captured codes
 * never reached the drawing.
 */

import { KENYA_FIELD_CODE_TABLE, type FieldCodeDefinition } from '@/lib/engine/fieldToFinish'

export const RECENT_FIELD_CODES_KEY = 'metardu_recent_field_codes'
export const MAX_RECENT_FIELD_CODES = 6

export type SurveyProfile = 'cadastral' | 'topographic' | 'engineering' | 'general'

/** Codes a crew reaches for first in each job type. */
const PREFERRED_CATEGORIES: Record<SurveyProfile, FieldCodeDefinition['category'][]> = {
  cadastral: ['monument', 'boundary'],
  topographic: ['topographic', 'natural', 'infrastructure'],
  engineering: ['infrastructure', 'utility', 'topographic'],
  general: ['monument', 'boundary', 'infrastructure', 'topographic'],
}

const BY_CODE = new Map(KENYA_FIELD_CODE_TABLE.map(definition => [definition.code.toUpperCase(), definition]))

export function surveyProfile(surveyType: string | undefined): SurveyProfile {
  switch ((surveyType ?? '').toLowerCase()) {
    case 'cadastral': return 'cadastral'
    case 'topographic': case 'topo': return 'topographic'
    case 'engineering': case 'road': case 'setting-out': case 'setout': return 'engineering'
    default: return 'general'
  }
}

export function findFieldCode(code: string | undefined): FieldCodeDefinition | undefined {
  return code ? BY_CODE.get(code.trim().toUpperCase()) : undefined
}

type CodeStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): CodeStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

/** Most-recently-used codes, newest first, ignoring anything not in the table. */
export function readRecentFieldCodes(storage: CodeStorage | undefined = defaultStorage()): string[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(RECENT_FIELD_CODES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim().toUpperCase())
      .filter(code => BY_CODE.has(code))
      .slice(0, MAX_RECENT_FIELD_CODES)
  } catch {
    return []
  }
}

/** Record a use and return the new recent list (deduplicated, capped). */
export function rememberFieldCode(code: string, storage: CodeStorage | undefined = defaultStorage()): string[] {
  const normalised = code.trim().toUpperCase()
  if (!BY_CODE.has(normalised)) return readRecentFieldCodes(storage)
  const next = [normalised, ...readRecentFieldCodes(storage).filter(existing => existing !== normalised)]
    .slice(0, MAX_RECENT_FIELD_CODES)
  try {
    storage?.setItem(RECENT_FIELD_CODES_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — the code still applies to this capture */
  }
  return next
}

/**
 * Chips shown before the surveyor opens the full list: their own recent codes
 * first, then the codes that matter most for this job type.
 */
export function quickFieldCodes(
  profile: SurveyProfile,
  recent: string[],
  limit = MAX_RECENT_FIELD_CODES,
): FieldCodeDefinition[] {
  const ordered: FieldCodeDefinition[] = []
  const seen = new Set<string>()

  const push = (definition: FieldCodeDefinition | undefined) => {
    if (!definition || seen.has(definition.code)) return
    seen.add(definition.code)
    ordered.push(definition)
  }

  recent.map(findFieldCode).forEach(push)
  PREFERRED_CATEGORIES[profile]
    .flatMap(category => KENYA_FIELD_CODE_TABLE.filter(definition => definition.category === category))
    .forEach(push)

  return ordered.slice(0, limit)
}

/**
 * Search by code, label or category. An empty query lists the codes that matter
 * for this job type, so the panel is useful without typing.
 */
export function filterFieldCodes(
  query: string,
  profile: SurveyProfile,
  limit = 30,
): FieldCodeDefinition[] {
  const needle = query.trim().toUpperCase()
  if (!needle) return quickFieldCodes(profile, [], limit)

  const startsWith: FieldCodeDefinition[] = []
  const contains: FieldCodeDefinition[] = []
  for (const definition of KENYA_FIELD_CODE_TABLE) {
    const code = definition.code.toUpperCase()
    const label = definition.label.toUpperCase()
    if (code.startsWith(needle)) startsWith.push(definition)
    else if (code.includes(needle) || label.includes(needle) || definition.category.toUpperCase().includes(needle)) contains.push(definition)
  }
  return [...startsWith, ...contains].slice(0, limit)
}
