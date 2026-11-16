import {
  RECENT_FIELD_CODES_KEY,
  filterFieldCodes,
  findFieldCode,
  quickFieldCodes,
  readRecentFieldCodes,
  rememberFieldCode,
  surveyProfile,
} from '../fieldCodePicker'

function memoryStorage(initial?: string) {
  const store = new Map<string, string>()
  if (initial !== undefined) store.set(RECENT_FIELD_CODES_KEY, initial)
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
  }
}

describe('field code picker', () => {
  it('maps the job type to the codes a crew reaches for first', () => {
    expect(surveyProfile('cadastral')).toBe('cadastral')
    expect(surveyProfile('topographic')).toBe('topographic')
    expect(surveyProfile('engineering')).toBe('engineering')
    expect(surveyProfile(undefined)).toBe('general')

    expect(quickFieldCodes('cadastral', []).map(code => code.code)).toEqual(expect.arrayContaining(['MB', 'BDY']))
    expect(quickFieldCodes('topographic', []).map(code => code.code)).not.toContain('MB')
  })

  it('puts recent codes first and never repeats one', () => {
    const quick = quickFieldCodes('cadastral', ['FNC', 'MB', 'FNC'])
    expect(quick.map(code => code.code).slice(0, 2)).toEqual(['FNC', 'MB'])
    expect(new Set(quick.map(code => code.code)).size).toBe(quick.length)
  })

  it('resolves a code to the CAD layer it will produce', () => {
    expect(findFieldCode('bld')?.layer).toBe('BUILDINGS')
    expect(findFieldCode('nope')).toBeUndefined()
  })

  it('searches by code prefix first, then name and category', () => {
    const prefixed = filterFieldCodes('BL', 'general')
    expect(prefixed[0].code).toBe('BLD')

    const byName = filterFieldCodes('fence', 'general').map(code => code.code)
    expect(byName).toContain('FNC')

    expect(filterFieldCodes('', 'cadastral').length).toBeGreaterThan(0)
    expect(filterFieldCodes('zzzznomatch', 'general')).toEqual([])
  })

  it('keeps only real codes in the recent list and caps it', () => {
    const storage = memoryStorage(JSON.stringify(['FNC', 'NOT_A_CODE', 'bld']))
    expect(readRecentFieldCodes(storage)).toEqual(['FNC', 'BLD'])

    const broken = memoryStorage('{not json')
    expect(readRecentFieldCodes(broken)).toEqual([])

    let last: string[] = []
    for (const code of ['MB', 'IP', 'CP', 'BS', 'BM', 'BDY', 'FNC']) last = rememberFieldCode(code, storage)
    expect(last).toHaveLength(6)
    expect(last[0]).toBe('FNC')
    // The oldest use is the one that falls off the list.
    expect(last).not.toContain('MB')
  })
})
