import { fieldBookControlSchema, type FieldBookControl } from '@/lib/validation/fieldBookControl'

export interface FieldBookControlDraft {
  name: string
  easting: string
  northing: string
  notes: string
  confirmed: boolean
}

export function controlDraft(value: unknown, projectCrs: string | null): FieldBookControlDraft {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const coordinateText = (input: unknown) => (typeof input === 'number' || typeof input === 'string') && String(input).trim() !== '' && Number.isFinite(Number(input)) ? String(input) : ''
  return {
    name: typeof record.name === 'string' ? record.name : '',
    easting: coordinateText(record.easting), northing: coordinateText(record.northing),
    notes: typeof record.notes === 'string' ? record.notes : '',
    confirmed: Boolean(projectCrs && record.crs === projectCrs),
  }
}

/** Blank coordinates stay unknown; a CRS confirmation does not verify control. */
export function parseControlDraft(draft: FieldBookControlDraft, projectCrs: string | null): FieldBookControl | null {
  if (!draft.name.trim() && !draft.easting.trim() && !draft.northing.trim() && !draft.notes.trim()) return null
  if (!draft.confirmed || !projectCrs) throw new Error('Confirm that the starting coordinate uses the declared project grid.')
  if (!draft.easting.trim() || !draft.northing.trim()) throw new Error('Enter both starting coordinates. Blank values are unknown.')
  const parsed = fieldBookControlSchema.safeParse({ name: draft.name, easting: Number(draft.easting), northing: Number(draft.northing), crs: projectCrs, notes: draft.notes })
  if (!parsed.success) throw new Error('Enter a station name and finite starting coordinates in the declared grid.')
  return parsed.data
}
