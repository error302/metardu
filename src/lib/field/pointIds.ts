const POINT_ID_MARKER = /(?:^|;\s*)METARDU_POINT_ID=([^;\s]+)/i
const FEATURE_CODE_MARKER = /(?:^|;\s*)CODE=([A-Za-z0-9_.-]{1,32})/i
const ROAD_CODE_MARKER = /(?:^|;\s*)ROAD_CODE=([A-Za-z0-9_.-]{1,32})/i
/** Field codes are a small controlled vocabulary; anything else is rejected. */
const FEATURE_CODE_SHAPE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/

export function appendFieldPointId(notes: string | undefined, pointId: string): string {
  const baseNotes = (notes ?? '')
    .replace(/(?:^|;\s*)METARDU_POINT_ID=[^;]*/i, '')
    .replace(/^\s*;\s*|;\s*$/g, '')
    .trim()

  return baseNotes
    ? `${baseNotes}; METARDU_POINT_ID=${pointId}`
    : `METARDU_POINT_ID=${pointId}`
}

export function readFieldPointId(notes: string | undefined): string {
  return notes?.match(POINT_ID_MARKER)?.[1] ?? ''
}

/**
 * Write the feature code into the notes as a stable, parseable token.
 *
 * The code used to be stored as bare free text ("TREE"), which nothing could
 * read back reliably — so captured codes never reached the DXF/field-to-finish
 * pipeline. `CODE=` keeps it machine-readable without a schema change.
 */
export function appendFieldPointCode(notes: string | undefined, code: string | undefined): string {
  const baseNotes = (notes ?? '')
    .replace(/(?:^|;\s*)CODE=[^;]*/i, '')
    .replace(/^\s*;\s*|;\s*$/g, '')
    .trim()
  const trimmed = code?.trim()
  if (!trimmed || !FEATURE_CODE_SHAPE.test(trimmed)) return baseNotes
  const normalised = trimmed.toUpperCase()
  return baseNotes ? `CODE=${normalised}; ${baseNotes}` : `CODE=${normalised}`
}

/**
 * Read the feature code back from notes.
 *
 * Falls back to the road-plan token so points captured by the road workflow
 * (which has used ROAD_CODE= since the start) read back the same way.
 */
export function readFieldPointCode(notes: string | undefined): string {
  return (notes?.match(FEATURE_CODE_MARKER)?.[1] ?? notes?.match(ROAD_CODE_MARKER)?.[1] ?? '').toUpperCase()
}

export function nextFieldPointNumber(pointIdPrefix: string, pointIds: string[]): number {
  const escapedPrefix = pointIdPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pointPattern = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i')
  const highestStoredNumber = pointIds.reduce((highest, pointId) => {
    const match = pointId.match(pointPattern)
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)

  // Legacy local observations did not persist point IDs. Counting them avoids
  // reusing the early sequence even when their original labels are unavailable.
  return Math.max(highestStoredNumber, pointIds.length) + 1
}
