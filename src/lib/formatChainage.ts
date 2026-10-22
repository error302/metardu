/** Format a display label only; source stationing remains unrounded. */
export function formatChainageLabel(chainageM: number, decimals: 0 | 1 | 2 | 3 = 3, prefix = ''): string {
  const unitsPerMetre = 10 ** decimals
  const roundedUnits = Math.round(Math.abs(chainageM) * unitsPerMetre)
  if (!Number.isFinite(chainageM) || !Number.isSafeInteger(roundedUnits)) return '—'
  const unitsPerKilometre = 1000 * unitsPerMetre
  const kilometres = Math.floor(roundedUnits / unitsPerKilometre)
  const metres = ((roundedUnits % unitsPerKilometre) / unitsPerMetre)
    .toFixed(decimals).padStart(decimals ? decimals + 4 : 3, '0')
  const sign = chainageM < 0 && roundedUnits !== 0 ? '-' : ''
  return `${prefix}${sign}${kilometres}+${metres}`
}
