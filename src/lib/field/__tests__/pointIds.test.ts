import { appendFieldPointCode, appendFieldPointId, appendFieldQualityToken, nextFieldPointNumber, readFieldPointCode, readFieldPointId, readFieldQuality } from '../pointIds'

describe('field point ID persistence', () => {
  it('preserves existing notes and writes a replaceable point ID marker', () => {
    const notes = appendFieldPointId('ROAD_CODE=CL; CHAINAGE_M=0', 'RD7')

    expect(notes).toBe('ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD7')
    expect(readFieldPointId(notes)).toBe('RD7')
    expect(appendFieldPointId(notes, 'RD8')).toBe('ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD8')
  })

  it('writes a machine-readable feature code and reads it back, including legacy road codes', () => {
    const withCode = appendFieldPointId(appendFieldPointCode(undefined, 'fnc'), 'BP4')

    expect(withCode).toBe('CODE=FNC; METARDU_POINT_ID=BP4')
    expect(readFieldPointCode(withCode)).toBe('FNC')
    expect(readFieldPointCode('ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD1')).toBe('CL')
    expect(readFieldPointCode(undefined)).toBe('')
  })

  it('replaces an existing code instead of stacking tokens and refuses free text', () => {
    expect(appendFieldPointCode('CODE=FNC; NOTE=lane', 'WL')).toBe('CODE=WL; NOTE=lane')
    expect(appendFieldPointCode('NOTES only', 'not a code')).toBe('NOTES only')
    expect(appendFieldPointCode(undefined, '')).toBe('')
  })

  it('records the capture quality verdict without replacing an earlier one', () => {
    const notes = appendFieldPointId(appendFieldQualityToken(appendFieldPointCode(undefined, 'FNC'), 'RTK_FIXED'), 'BP4')
    expect(notes).toBe('QC=RTK_FIXED; CODE=FNC; METARDU_POINT_ID=BP4')
    expect(readFieldQuality(notes)).toBe('RTK_FIXED')
    expect(appendFieldQualityToken(notes, 'DGPS')).toBe('QC=DGPS; CODE=FNC; METARDU_POINT_ID=BP4')
  })

  it('chooses the next unused sequence after reload and legacy observations', () => {
    expect(nextFieldPointNumber('RD', ['RD1', 'RD5'])).toBe(6)
    expect(nextFieldPointNumber('RD', ['BP99', 'RD02'])).toBe(3)
    expect(nextFieldPointNumber('BP', ['', '', ''])).toBe(4)
  })
})
