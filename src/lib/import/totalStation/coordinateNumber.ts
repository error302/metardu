/** Empty is unknown; malformed text remains invalid, never a numeric prefix. */
export function coordinateNumber(value: unknown): number | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return undefined
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return Number.NaN
  return Number(text)
}
