const POINT_ID_MARKER = /(?:^|;\s*)METARDU_POINT_ID=([^;\s]+)/i

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
