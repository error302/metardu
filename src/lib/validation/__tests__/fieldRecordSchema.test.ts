import { fieldRecordSchema } from '../apiValidation'
import { FIELD_RECORD_CRS_CODES } from '@/lib/field/fieldRecordCrs'

describe('fieldRecordSchema coordinate reference requirements', () => {
  const record = {
    frNumber: 'FR/123/456',
    easting: 534850,
    northing: 9574220,
  }

  it('requires an explicit supported CRS before accepting coordinates', () => {
    expect(fieldRecordSchema.safeParse(record).success).toBe(false)

    for (const horizontalCrs of FIELD_RECORD_CRS_CODES) {
      expect(fieldRecordSchema.safeParse({ ...record, horizontalCrs }).success).toBe(true)
    }
  })

  it('rejects display-only and unsupported CRSs', () => {
    const unsupportedNorthernUtm = `EPSG:${32600 + 36}`
    expect(fieldRecordSchema.safeParse({ ...record, horizontalCrs: 'EPSG:3857' }).success).toBe(false)
    expect(fieldRecordSchema.safeParse({ ...record, horizontalCrs: unsupportedNorthernUtm }).success).toBe(false)
  })
})
