import { processRINEXBaseline, type RINEXBaselineResponse } from '../baselineClient'

const file = (name: string, text: string) => ({ name, size: text.length, text: async () => text })

const validResponse: RINEXBaselineResponse = {
  baseline: {
    rover_latitude: -1.2921, rover_longitude: 36.8219, rover_height: 1650.32,
    sigma_north: 0.004, sigma_east: 0.005, sigma_up: 0.012,
    quality: 'FIX', sat_count: 18, ratio: 4.2,
  },
  meta: {
    processedBy: 'RTKLIB (rnx2rtkp)', mode: 'static', frequency: 'l1+l2',
    elevationMask: 15, ambiguityResolution: 'continuous',
    basePosition: { latitude: -1.2921, longitude: 36.8219, ellipsoidalHeight: 1650.32 },
    processedAt: '2026-10-05T09:00:00.000Z',
  },
}

describe('RINEX baseline client', () => {
  it.each([
    { basePosition: { ...validResponse.meta.basePosition, ellipsoidalHeight: 999 } },
    { basePosition: { ...validResponse.meta.basePosition, latitude: 0 } },
    { mode: 'kinematic' }, { frequency: 'l1' }, { elevationMask: 0 }, { ambiguityResolution: 'off' },
    { processedBy: 'another solver' }, { processedAt: 'invalid date' },
  ])('rejects response metadata that is invalid or differs from the submitted control/settings: %j', async meta => {
    const files = { base: file('base.obs', 'B'.repeat(120)), rover: file('rover.obs', 'R'.repeat(120)), navigation: file('nav.nav', 'N'.repeat(120)) }
    await expect(processRINEXBaseline(files,
      { mode: 'static', frequency: 'l1+l2', elevationMask: 15, ambiguityResolution: 'continuous' },
      validResponse.meta.basePosition,
      async () => ({ ok: true, status: 200, json: async () => ({ ...validResponse, meta: { ...validResponse.meta, ...meta } }) } as Response),
    )).rejects.toThrow(/metadata|submitted/)
  })
  it('sends the selected source files and settings to the authenticated RTKLIB endpoint', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => validResponse })
    const files = {
      base: file('base.26o', 'B'.repeat(120)),
      rover: file('rover.26o', 'R'.repeat(130)),
      navigation: file('mixed.26p', 'N'.repeat(140)),
    }
    const options = { mode: 'static' as const, frequency: 'l1+l2' as const, elevationMask: 15, ambiguityResolution: 'continuous' as const }
    const basePosition = { latitude: -1.2921, longitude: 36.8219, ellipsoidalHeight: 1650.32 }

    const result = await processRINEXBaseline(files, options, basePosition, fetcher)

    expect(result).toEqual(validResponse)
    expect(fetcher).toHaveBeenCalledWith('/api/gnss/baseline-process', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ baseRinex: 'B'.repeat(120), roverRinex: 'R'.repeat(130), navRinex: 'N'.repeat(140), basePosition, options }),
    }))
  })

  it('does not submit truncated or empty RINEX files', async () => {
    const fetcher = jest.fn()
    await expect(processRINEXBaseline({
      base: file('base.26o', 'short'), rover: file('rover.26o', 'R'.repeat(120)), navigation: file('nav.26p', 'N'.repeat(120)),
    }, { mode: 'static', frequency: 'l1+l2', elevationMask: 15, ambiguityResolution: 'continuous' }, { latitude: -1, longitude: 36, ellipsoidalHeight: 100 }, fetcher))
      .rejects.toThrow(/at least 100 characters/)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses oversized RINEX files before reading or uploading them', async () => {
    const read = jest.fn(async () => 'B'.repeat(120))
    const fetcher = jest.fn()
    await expect(processRINEXBaseline({
      base: { name: 'base.26o', size: 25 * 1024 * 1024 + 1, text: read },
      rover: file('rover.26o', 'R'.repeat(120)), navigation: file('nav.26p', 'N'.repeat(120)),
    }, { mode: 'static', frequency: 'l1+l2', elevationMask: 15, ambiguityResolution: 'continuous' },
    { latitude: -1, longitude: 36, ellipsoidalHeight: 100 }, fetcher))
      .rejects.toThrow(/25 MiB or smaller/)
    expect(read).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('surfaces worker errors and rejects invalid coordinates instead of presenting them', async () => {
    const files = {
      base: file('base.26o', 'B'.repeat(120)), rover: file('rover.26o', 'R'.repeat(120)), navigation: file('nav.26p', 'N'.repeat(120)),
    }
    const options = { mode: 'static' as const, frequency: 'l1+l2' as const, elevationMask: 15, ambiguityResolution: 'continuous' as const }
    const basePosition = { latitude: -1, longitude: 36, ellipsoidalHeight: 100 }
    await expect(processRINEXBaseline(files, options, basePosition, async () => ({ ok: false, status: 503, json: async () => ({ error: 'RTKLIB is unavailable' }) } as Response)))
      .rejects.toThrow('RTKLIB is unavailable')

    await expect(processRINEXBaseline(files, options, basePosition, async () => ({ ok: true, status: 200, json: async () => ({
      ...validResponse, baseline: { ...validResponse.baseline, rover_latitude: Number.NaN },
    }) } as Response))).rejects.toThrow(/invalid measurements/)
  })

  it('rejects non-relative solutions and impossible reported uncertainty', async () => {
    const files = {
      base: file('base.26o', 'B'.repeat(120)), rover: file('rover.26o', 'R'.repeat(120)), navigation: file('nav.26p', 'N'.repeat(120)),
    }
    const options = { mode: 'static' as const, frequency: 'l1+l2' as const, elevationMask: 15, ambiguityResolution: 'continuous' as const }
    const basePosition = { latitude: -1, longitude: 36, ellipsoidalHeight: 100 }
    await expect(processRINEXBaseline(files, options, basePosition, async () => ({ ok: true, status: 200, json: async () => ({
      ...validResponse, baseline: { ...validResponse.baseline, quality: 'SINGLE' },
    }) } as Response))).rejects.toThrow(/non-relative solution/)
    await expect(processRINEXBaseline(files, options, basePosition, async () => ({ ok: true, status: 200, json: async () => ({
      ...validResponse, baseline: { ...validResponse.baseline, sigma_up: -1 },
    }) } as Response))).rejects.toThrow(/non-relative solution/)
  })
})
