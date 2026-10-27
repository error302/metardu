import { z } from 'zod'
import { parseCsvRecords } from './csvRecords'

export const MAX_SCHEME_IMPORT_BYTES = 4 * 1024 * 1024
export const MAX_SCHEME_IMPORT_ROWS = 10000
export const SCHEME_IMPORT_PROTOCOL = 'scheme-metadata-import-v1' as const
export interface SchemeMetadataRow {
  parcel_number: string
  lr_number_proposed: string | null
  area_ha: number | null
  notes: string | null
}

export class SchemeCsvError extends Error {
  constructor(message: string, public readonly statusCode = 400) { super(message); this.name = 'SchemeCsvError' }
}

const aliases: Record<keyof SchemeMetadataRow, readonly string[]> = {
  parcel_number: ['parcel_number','parcel','parcel_no','plot_number','plot_no','number'],
  lr_number_proposed: ['lr_number_proposed','lr_number','lr_no','lr_proposed','lr','proposed_lr'],
  area_ha: ['area_ha','size_ha','hectares'],
  notes: ['notes','description','remarks','comment'],
}

/** Metadata only: supplied areas are hectares, never computed geometry or field evidence. */
export function prepareSchemeMetadataCsv(text: string): SchemeMetadataRow[] {
  let records: string[][]
  try { records = parseCsvRecords(text.replace(/^\uFEFF/, ''), { strict: true, maxRecords: MAX_SCHEME_IMPORT_ROWS + 1 }) }
  catch (error) { const message = error instanceof Error ? error.message : 'Invalid CSV'; throw new SchemeCsvError(message, /data-row limit/.test(message) ? 413 : 400) }
  if (records.length < 2) throw new SchemeCsvError('The CSV must include headers and at least one parcel.')
  const headers = records[0].map(value => value.trim().toLowerCase())
  const columns = new Map<keyof SchemeMetadataRow, number>()
  headers.forEach((header, index) => {
    const key = (Object.keys(aliases) as Array<keyof SchemeMetadataRow>).find(field => aliases[field].includes(header))
    if (!key) throw new SchemeCsvError(header === 'area' ? 'Use area_ha to declare hectares; unitless area is not accepted.' : `Unsupported CSV column: ${header || '(empty)'}.`)
    if (columns.has(key)) throw new SchemeCsvError(`The CSV contains more than one ${key} column.`)
    columns.set(key, index)
  })
  if (!columns.has('parcel_number')) throw new SchemeCsvError('The parcel_number column is required.')
  const names = new Set<string>()
  return records.slice(1).map((record, index) => {
    const row = index + 2
    if (record.length !== headers.length) throw new SchemeCsvError(`Record ${row}: column count does not match the header.`)
    const cell = (field: keyof SchemeMetadataRow) => { const column = columns.get(field); return column === undefined ? '' : record[column].trim() }
    const parcelNumber = cell('parcel_number')
    if (!parcelNumber || parcelNumber.length > 30 || /[\u0000-\u001f\u007f]/.test(parcelNumber)) throw new SchemeCsvError(`Record ${row}: parcel_number must contain 1–30 printable characters.`)
    if (names.has(parcelNumber)) throw new SchemeCsvError(`Record ${row}: duplicate parcel_number ${parcelNumber}.`)
    names.add(parcelNumber)
    const lr = cell('lr_number_proposed'), notes = cell('notes'), area = cell('area_ha')
    if (lr.length > 50 || /[\u0000-\u001f\u007f]/.test(lr)) throw new SchemeCsvError(`Record ${row}: proposed LR must contain at most 50 printable characters.`)
    if (notes.length > 1000 || notes.includes('\u0000')) throw new SchemeCsvError(`Record ${row}: notes exceed 1,000 characters or contain a null character.`)
    if (area && (!/^\d{1,6}(?:\.\d{1,6})?$/.test(area) || Number(area) <= 0)) throw new SchemeCsvError(`Record ${row}: area_ha must be a positive decimal in hectares, with at most six integer and six fractional digits.`)
    return { parcel_number: parcelNumber, lr_number_proposed: lr || null, area_ha: area ? Number(area) : null, notes: notes || null }
  })
}

export const schemeImportReceiptSchema = z.object({
  protocol: z.literal(SCHEME_IMPORT_PROTOCOL), requestId: z.string().guid(), projectId: z.string().guid(), blockId: z.string().guid(),
  sourceFileHash: z.string().regex(/^[a-f0-9]{64}$/), sourceFileName: z.string().min(1).max(255),
  total_rows: z.number().int().positive().max(MAX_SCHEME_IMPORT_ROWS), created: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), errors: z.array(z.string()).max(0),
  fieldVerified: z.literal(false), replayed: z.boolean(),
}).refine(value => value.created + value.unchanged === value.total_rows && value.skipped === value.unchanged, 'Incomplete import receipt')
export type SchemeImportReceipt = z.infer<typeof schemeImportReceiptSchema>
