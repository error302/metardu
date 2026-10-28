/** Fail explicitly when a required fixture/result is absent; preserve zero and false. */
export function requiredValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('A required test value is missing.')
  return value
}
