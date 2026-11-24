import { resolvePrintableCrs } from '../projectReferenceSystem'
import { registerCrs } from '../projectCrs'

/**
 * A deliverable may only print a coordinate reference that came out of the
 * CRS registry. These tests pin the two halves:
 *   - a selected registry code resolves into a registry-derived label;
 *   - anything that is not a registered projected CRS in metres fails closed
 *     instead of being labelled with a remembered datum.
 */
describe('resolvePrintableCrs', () => {
  it('describes a selected CRS from the registry, not from typed text', () => {
    const result = resolvePrintableCrs('EPSG:21037')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)
    expect(result.crs).toMatchObject({
      code: 'EPSG:21037',
      datum: 'Arc 1960',
      units: 'metres',
      zone: 37,
      hemisphere: 'S',
    })
    expect(result.crs.label).toBe('Arc 1960 / UTM Zone 37S (EPSG:21037)')
  })

  it('refuses an empty selection', () => {
    for (const missing of [null, undefined, '', '   ']) {
      const result = resolvePrintableCrs(missing)
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure')
      expect(result.message).toMatch(/select a coordinate reference/i)
    }
  })

  it('refuses a display-only projection and a geographic CRS', () => {
    const display = resolvePrintableCrs('EPSG:3857')
    expect(display.ok).toBe(false)
    if (display.ok) throw new Error('expected failure')
    expect(display.message).toMatch(/display-only/i)

    const geographic = resolvePrintableCrs('EPSG:4326')
    expect(geographic.ok).toBe(false)
    if (geographic.ok) throw new Error('expected failure')
    expect(geographic.message).toMatch(/projected/i)
  })

  it('refuses an unregistered CRS instead of guessing a datum', () => {
    const result = resolvePrintableCrs('EPSG:999999')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.message).toMatch(/not in the CRS registry/i)
  })

  it('describes a registered local grid without inventing a UTM zone', () => {
    registerCrs(
      {
        code: 'LOCAL:PRINTABLE-TEST',
        name: 'Printable test local grid',
        datum: 'Local site datum',
        units: 'metres',
        projected: true,
      },
      '+proj=utm +zone=37 +south +ellps=clrk80 +units=m +no_defs',
    )
    const result = resolvePrintableCrs('LOCAL:PRINTABLE-TEST')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)
    expect(result.crs.label).toBe('Printable test local grid (LOCAL:PRINTABLE-TEST)')
    expect(result.crs.zone).toBeUndefined()
    expect(result.crs.hemisphere).toBeUndefined()
  })
})
