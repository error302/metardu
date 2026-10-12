/**
 * Golden tests for the Project Reference System persistence mapping
 * (settings declaration → authority validation → row round-trip).
 *
 * The mathematical behaviour of createProjectReferenceSystem() is covered by
 * projectCrs.test.ts; this file covers the derivation rules, the refusal of
 * invalid declarations, and the row round-trip used by the API route.
 */

import {
  buildProjectReferenceSystem,
  fromReferenceSystemRow,
  horizontalCrsFor,
  normalizeDatumSelection,
  toReferenceSystemRow,
  type ProjectReferenceSystemRecord,
} from '../projectReferenceSystem'
import { CrsError } from '../projectCrs'

const KENYA_37S = { datum: 'ARC1960', utmZone: 37, hemisphere: 'S' } as const

describe('normalizeDatumSelection', () => {
  it('accepts every historical spelling of the Kenyan / WGS 84 selections', () => {
    expect(normalizeDatumSelection('ARC1960')).toBe('ARC1960')
    expect(normalizeDatumSelection('Arc 1960')).toBe('ARC1960')
    expect(normalizeDatumSelection('arc-1960')).toBe('ARC1960')
    expect(normalizeDatumSelection('WGS84')).toBe('WGS84')
    expect(normalizeDatumSelection('WGS 84')).toBe('WGS84')
    expect(normalizeDatumSelection('WGS84Geographic')).toBe('WGS84Geographic')
    expect(normalizeDatumSelection('geographic')).toBe('WGS84Geographic')
  })

  it('refuses an unknown datum instead of guessing', () => {
    expect(() => normalizeDatumSelection('NAD27')).toThrow(CrsError)
    expect(() => normalizeDatumSelection('')).toThrow(/Unknown datum selection/)
  })
})

describe('horizontalCrsFor — derivation of the authority code', () => {
  it('maps Arc 1960 Kenyan zones to the national codes', () => {
    expect(horizontalCrsFor('ARC1960', 37, 'S')).toBe('EPSG:21037')
    expect(horizontalCrsFor('Arc 1960', 36, 'S')).toBe('EPSG:21036')
  })

  it('refuses Arc 1960 zones and hemispheres that are not registered', () => {
    expect(() => horizontalCrsFor('ARC1960', 38, 'S')).toThrow(/36S and 37S/)
    expect(() => horizontalCrsFor('ARC1960', 37, 'N')).toThrow(CrsError)
    expect(() => horizontalCrsFor('ARC1960', 37, 'N')).toThrow(/hemisphere/i)
  })

  it('maps WGS 84 UTM to the 326xx / 327xx family', () => {
    expect(horizontalCrsFor('WGS84', 37, 'S')).toBe('EPSG:32737')
    expect(horizontalCrsFor('WGS84', 37, 'N')).toBe('EPSG:32637')
    expect(horizontalCrsFor('WGS84', 1, 'N')).toBe('EPSG:32601')
  })

  it('returns the geographic code for the geographic selection (rejected later)', () => {
    expect(horizontalCrsFor('WGS84Geographic', 37, 'S')).toBe('EPSG:4326')
  })

  it('rejects out-of-range zones and bad hemispheres', () => {
    expect(() => horizontalCrsFor('WGS84', 0, 'S')).toThrow(/1-60/)
    expect(() => horizontalCrsFor('WGS84', 61, 'N')).toThrow(/1-60/)
    expect(() => horizontalCrsFor('WGS84', 37.5, 'S')).toThrow(/1-60/)
    expect(() =>
      horizontalCrsFor('WGS84', 37, 'X' as unknown as 'N'),
    ).toThrow(/Hemisphere/)
  })
})

describe('buildProjectReferenceSystem', () => {
  it('builds the Kenyan cadastral declaration with visible defaults', () => {
    const prs = buildProjectReferenceSystem(KENYA_37S)
    expect(prs.horizontalCrs).toBe('EPSG:21037')
    expect(prs.horizontalName).toBe('Arc 1960 / UTM zone 37S')
    expect(prs.datum).toBe('Arc 1960')
    expect(prs.units).toBe('metres')
    expect(prs.zone).toBe(37)
    expect(prs.hemisphere).toBe('S')
    expect(prs.distanceMode).toBe('grid')
    expect(prs.coordinatePrecision).toBe(3)
    expect(prs.angularUnit).toBe('degrees')
    expect(prs.combinedScaleFactor).toBeUndefined()
  })

  it('carries vertical, calibration, and mode fields through', () => {
    const prs = buildProjectReferenceSystem({
      ...KENYA_37S,
      verticalDatum: 'Kenya orthometric (mean sea level)',
      verticalReference: 'orthometric',
      distanceMode: 'ground',
      combinedScaleFactor: 1.0000786,
      coordinatePrecision: 4,
      notes: 'CAL-2026-01',
    })
    expect(prs.verticalDatum).toBe('Kenya orthometric (mean sea level)')
    expect(prs.verticalReference).toBe('orthometric')
    expect(prs.distanceMode).toBe('ground')
    expect(prs.combinedScaleFactor).toBeCloseTo(1.0000786, 9)
    expect(prs.coordinatePrecision).toBe(4)
    expect(prs.notes).toBe('CAL-2026-01')
  })

  it('refuses a geographic CRS — plane survey math is undefined in degrees', () => {
    expect(() =>
      buildProjectReferenceSystem({ datum: 'WGS84Geographic', utmZone: 37, hemisphere: 'S' }),
    ).toThrow(CrsError)
    expect(() =>
      buildProjectReferenceSystem({ datum: 'WGS84Geographic', utmZone: 37, hemisphere: 'S' }),
    ).toThrow(/geographic/i)
  })

  it('refuses an unregistered Arc 1960 zone', () => {
    expect(() =>
      buildProjectReferenceSystem({ datum: 'ARC1960', utmZone: 38, hemisphere: 'S' }),
    ).toThrow(/not registered/)
  })

  it('refuses a non-positive combined scale factor and bad precision', () => {
    expect(() =>
      buildProjectReferenceSystem({ ...KENYA_37S, combinedScaleFactor: 0 }),
    ).toThrow(/positive/)
    expect(() =>
      buildProjectReferenceSystem({ ...KENYA_37S, combinedScaleFactor: Number.NaN }),
    ).toThrow(/positive/)
    expect(() =>
      buildProjectReferenceSystem({ ...KENYA_37S, coordinatePrecision: 7 }),
    ).toThrow(/precision/)
    expect(() =>
      buildProjectReferenceSystem({ ...KENYA_37S, coordinatePrecision: 2.5 }),
    ).toThrow(/precision/)
  })
})

describe('row round-trip (migration 065 columns)', () => {
  const fullRecord = (): ProjectReferenceSystemRecord => {
    const prs = buildProjectReferenceSystem({
      ...KENYA_37S,
      verticalDatum: 'Kenya orthometric (mean sea level)',
      verticalReference: 'orthometric',
      distanceMode: 'ground',
      combinedScaleFactor: 1.000078612,
      coordinatePrecision: 4,
      notes: 'Declared during Sprint A wiring',
    })
    return {
      prs,
      geoidModel: 'EGM2008',
      benchmarkBasis: 'BM 1234 / ARP benchmark',
      calibrationVersion: 'CAL-2026-01',
      calibrationNotes: 'RMS residual 12 mm on 6 checkpoints',
      csfProvenance: 'computed',
      csfReference: { easting: 450000, northing: 9858000, height: 1600 },
      declaredBy: 'user-123',
      declaredAt: '2026-09-28T10:00:00.000Z',
    }
  }

  it('round-trips a full declaration without loss', () => {
    const original = fullRecord()
    const row = toReferenceSystemRow('project-abc', original, 'user-123')
    const back = fromReferenceSystemRow(row)
    expect(back).not.toBeNull()
    expect(back?.prs).toEqual(original.prs)
    expect(back?.geoidModel).toBe('EGM2008')
    expect(back?.benchmarkBasis).toBe('BM 1234 / ARP benchmark')
    expect(back?.calibrationVersion).toBe('CAL-2026-01')
    expect(back?.calibrationNotes).toBe('RMS residual 12 mm on 6 checkpoints')
    expect(back?.csfProvenance).toBe('computed')
    expect(back?.csfReference).toEqual(original.csfReference)
    expect(back?.declaredBy).toBe('user-123')
    expect(back?.declaredAt).toBe('2026-09-28T10:00:00.000Z')
    expect(row.project_id).toBe('project-abc')
    expect(row.horizontal_crs).toBe('EPSG:21037')
    expect(row.units).toBe('metres')
    expect(row.distance_mode).toBe('ground')
    expect(row.coordinate_precision).toBe(4)
  })

  it('round-trips a minimal declaration (no vertical, no adopted factor)', () => {
    const original: ProjectReferenceSystemRecord = {
      prs: buildProjectReferenceSystem(KENYA_37S),
      declaredBy: null,
    }
    const back = fromReferenceSystemRow(toReferenceSystemRow('project-abc', original, null))
    expect(back?.prs).toEqual(original.prs)
    expect(back?.csfReference).toBeUndefined()
    expect(back?.csfProvenance).toBeUndefined()
    expect(back?.geoidModel).toBeUndefined()
  })

  it('reports an absent declaration as null rather than substituting one', () => {
    expect(fromReferenceSystemRow(null)).toBeNull()
    expect(fromReferenceSystemRow(undefined)).toBeNull()
    expect(fromReferenceSystemRow({})).toBeNull()
    expect(fromReferenceSystemRow({ project_id: 'p', distance_mode: 'grid' })).toBeNull()
  })

  it('normalises a postgres timestamptz (Date) to ISO-8601', () => {
    const row = toReferenceSystemRow('project-abc', fullRecord(), 'user-123')
    const back = fromReferenceSystemRow({ ...row, declared_at: new Date('2026-09-28T10:00:00.000Z') })
    expect(back?.declaredAt).toBe('2026-09-28T10:00:00.000Z')
  })

  it('throws on a corrupt stored row instead of silently mis-stating it', () => {
    const row = toReferenceSystemRow('project-abc', fullRecord(), 'user-123')

    expect(() => fromReferenceSystemRow({ ...row, distance_mode: 'slope' })).toThrow(
      /distance mode/,
    )
    expect(() => fromReferenceSystemRow({ ...row, coordinate_precision: 9 })).toThrow(
      /precision/,
    )
    expect(() => fromReferenceSystemRow({ ...row, datum_name: null })).toThrow(CrsError)
    expect(() => fromReferenceSystemRow({ ...row, combined_scale_factor: -1 })).toThrow(
      /positive/,
    )
    expect(() => fromReferenceSystemRow({ ...row, csf_provenance: 'invented' })).toThrow(
      /provenance/,
    )
    expect(() => fromReferenceSystemRow({ ...row, csf_reference_northing: null })).toThrow(
      /incomplete/,
    )
    expect(() => fromReferenceSystemRow({ ...row, hemisphere: 'E' })).toThrow(/hemisphere/)
    expect(() =>
      fromReferenceSystemRow({ ...row, vertical_reference: 'chart datum' }),
    ).toThrow(/vertical reference/)
  })
})
