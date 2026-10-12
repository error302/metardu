import { appendFieldPointId, nextFieldPointNumber, readFieldPointId } from '../pointIds'

describe('field point ID persistence', () => {
  it('preserves existing notes and writes a replaceable point ID marker', () => {
    const notes = appendFieldPointId('ROAD_CODE=CL; CHAINAGE_M=0', 'RD7')

    expect(notes).toBe('ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD7')
    expect(readFieldPointId(notes)).toBe('RD7')
    expect(appendFieldPointId(notes, 'RD8')).toBe('ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD8')
  })

  it('chooses the next unused sequence after reload and legacy observations', () => {
    expect(nextFieldPointNumber('RD', ['RD1', 'RD5'])).toBe(6)
    expect(nextFieldPointNumber('RD', ['BP99', 'RD02'])).toBe(3)
    expect(nextFieldPointNumber('BP', ['', '', ''])).toBe(4)
  })
})
