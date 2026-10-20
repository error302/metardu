import { createHash } from 'node:crypto'

/** Opaque read revision, including timestamps and retained metadata. */
export function fieldBookRevision(rows: unknown[], startingControl: unknown = null): string {
  return createHash('sha256').update(JSON.stringify({ rows, startingControl })).digest('hex')
}
