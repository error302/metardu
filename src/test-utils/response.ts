/** Runtime assertions for JSON transport tests; payload fields remain unknown. */
export function recordValue(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.')
  return value as Record<string, unknown>
}

export async function responseObject(response: Pick<Response, 'json'>): Promise<Record<string, unknown>> {
  const value: unknown = await response.json()
  return recordValue(value)
}

export function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error('Expected an array of JSON objects')
  return value.map(recordValue)
}
