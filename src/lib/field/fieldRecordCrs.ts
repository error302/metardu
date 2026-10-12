/**
 * Supported source coordinate systems for the Kenya historic field-record
 * archive. Keep this list aligned with migration 083 and the PostGIS trigger.
 */
export const FIELD_RECORD_CRS_CODES = [
  'EPSG:21036', // Arc 1960 / UTM zone 36S
  'EPSG:21037', // Arc 1960 / UTM zone 37S
  'EPSG:32736', // WGS 84 / UTM zone 36S
  'EPSG:32737', // WGS 84 / UTM zone 37S
] as const

export type FieldRecordCrs = (typeof FIELD_RECORD_CRS_CODES)[number]

export const FIELD_RECORD_CRS_OPTIONS: ReadonlyArray<{ code: FieldRecordCrs; label: string }> = [
  { code: 'EPSG:21036', label: 'Arc 1960 / UTM 36S' },
  { code: 'EPSG:21037', label: 'Arc 1960 / UTM 37S' },
  { code: 'EPSG:32736', label: 'WGS 84 / UTM 36S' },
  { code: 'EPSG:32737', label: 'WGS 84 / UTM 37S' },
]

export function isFieldRecordCrs(value: string): value is FieldRecordCrs {
  return (FIELD_RECORD_CRS_CODES as readonly string[]).includes(value)
}

export function fieldRecordCrsLabel(value: string | null | undefined): string {
  return FIELD_RECORD_CRS_OPTIONS.find((option) => option.code === value)?.label ?? 'CRS unverified'
}
