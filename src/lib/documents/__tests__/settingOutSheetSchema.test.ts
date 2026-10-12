import { prepareSettingOutSheet } from '../settingOutSheetSchema'

const validRequest = {
  projectName: 'North access road',
  surveyorName: 'Surveyor Example',
  surveyorLicense: 'LS-123',
  date: '2026-10-12',
  projection: 'epsg:32737',
  referenceStation: 'STN-01',
  instrument: 'Total station',
  points: [{ pointId: 'P-01', designE: 500010, designN: 9900000 }],
}

describe('general setting-out sheet validation', () => {
  it('canonicalizes a registered projected CRS and derives its datum', () => {
    const result = prepareSettingOutSheet(validRequest)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.projection).toBe('EPSG:32737')
    expect(result.data.datum).toBe('WGS 84')
  })

  it.each(['EPSG:3857', 'EPSG:4326', 'EPSG:99999'])('fails closed for unsupported or non-survey CRS %s', projection => {
    const result = prepareSettingOutSheet({ ...validRequest, projection })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/CRS|projected|registered/i)
  })

  it('rejects coordinates outside the declared CRS range and duplicate point identifiers', () => {
    expect(prepareSettingOutSheet({
      ...validRequest,
      points: [{ pointId: 'P-01', designE: 1, designN: 9900000 }],
    })).toMatchObject({ ok: false, error: expect.stringMatching(/coordinate range/i) })

    expect(prepareSettingOutSheet({
      ...validRequest,
      points: [
        { pointId: 'P-01', designE: 500010, designN: 9900000 },
        { pointId: 'p-01', designE: 500020, designN: 9900000 },
      ],
    })).toMatchObject({ ok: false, error: expect.stringMatching(/duplicated/i) })
  })

  it('rejects impossible dates and missing survey attribution', () => {
    expect(prepareSettingOutSheet({ ...validRequest, date: '2026-02-30' })).toMatchObject({ ok: false })
    expect(prepareSettingOutSheet({ ...validRequest, surveyorLicense: '' })).toMatchObject({ ok: false, error: expect.stringMatching(/registration/i) })
  })

  it('requires non-negative decimal distance when one is supplied', () => {
    expect(prepareSettingOutSheet({
      ...validRequest,
      points: [{ pointId: 'P-01', designE: 500010, designN: 9900000, distance: '0x10' }],
    })).toMatchObject({ ok: false, error: expect.stringMatching(/distance.*decimal/i) })
  })
})
