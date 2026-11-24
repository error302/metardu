import { resolveDeclaredReference } from '../projectReferenceSystem'

/**
 * Deliverables must state the CRS the project declared, or refuse to state
 * one. These tests pin both halves: the registry supplies the label, and a
 * missing declaration fails closed instead of defaulting to Arc 1960 / zone 37.
 */
describe('resolveDeclaredReference', () => {
  it('refuses to invent a reference system when none is declared', () => {
    for (const missing of [null, undefined, '', '   ']) {
      const result = resolveDeclaredReference(missing)
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure')
      expect(result.message).toMatch(/no declared reference system/i)
      expect(result.message).toMatch(/Project Settings/i)
    }
  })

  it('describes a declared Arc 1960 zone from the registry, not a constant', () => {
    const result = resolveDeclaredReference('EPSG:21037')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)
    expect(result.reference).toMatchObject({
      horizontalCrs: 'EPSG:21037',
      datumSelection: 'ARC1960',
      zone: 37,
      hemisphere: 'S',
      units: 'metres',
    })
    expect(result.reference.datum).toMatch(/Arc 1960/i)
    expect(result.reference.label).toBe('Arc 1960 / UTM Zone 37S (EPSG:21037)')
  })

  it('does not label a WGS 84 project with an Arc 1960 code', () => {
    const result = resolveDeclaredReference('EPSG:32636')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)
    expect(result.reference).toMatchObject({
      horizontalCrs: 'EPSG:32636',
      datumSelection: 'WGS84',
      zone: 36,
      hemisphere: 'N',
    })
    expect(result.reference.label).toContain('EPSG:32636')
    // The defect this replaces: EPSG:210${zone} was built from the zone alone.
    expect(result.reference.label).not.toContain('21036')
    expect(result.reference.datum).toMatch(/WGS 84/i)
  })

  it('rejects geographic and display-only codes for survey mathematics', () => {
    for (const code of ['EPSG:4326', 'EPSG:3857']) {
      const result = resolveDeclaredReference(code)
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure')
      expect(result.message).toMatch(/not a projected UTM CRS/i)
    }
  })

  it('rejects an unregistered code instead of guessing its meaning', () => {
    const result = resolveDeclaredReference('EPSG:99999')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.message).toMatch(/not in the CRS registry/i)
  })
})
