import { parseGSI, type GSIParseResult } from '../parseGSI'

const parse = parseGSI as (source:string, options?:{foot:'international'|'USSurveyFoot'})=>GSIParseResult
const point = (unit:string, value:string, wi='81') => `110001+0000A110 ${wi}..0${unit}+${value} 82..00-00000992`

test.each([['0','00005387'],['6','00053870'],['8','00538700']])('GSI linear precision flag %s follows the Leica word unit, not an assumed millimetre', (unit, value) => {
  expect(parse(point(unit,value)).records[0].easting).toBeCloseTo(5.387,9)
})
test('station easting WI84 uses the word unit, not a different arbitrary divisor',()=>{
  expect(parse(point('0','00005387','84')).records[0].easting).toBeCloseTo(5.387,9)
})
test('an angular or unknown unit flag cannot become a coordinate',()=>{
  const result=parse(point('4','00005387'))
  expect(result.records[0].easting).toBeUndefined()
  expect(result.warnings.join(' ')).toMatch(/unit/i)
})
test('GSI feet require an explicit definition and convert exactly once',()=>{
  expect(parse(point('1','00001000')).records[0].easting).toBeUndefined()
  expect(parse(point('1','00001000'),{foot:'international'}).records[0].easting).toBeCloseTo(0.3048,12)
  expect(parse(point('1','00001000'),{foot:'USSurveyFoot'}).records[0].easting).toBeCloseTo(1200/3937,12)
})
test('GSI retains an alphanumeric point identifier and rejects numeric payload suffixes',()=>{
  expect(parse(point('0','00005387')).records[0].pointId).toBe('A110')
  const invalid=parse(point('0','0000538x'))
  expect(invalid.records[0].easting).toBeUndefined()
  expect(invalid.warnings.join(' ')).toMatch(/payload|numeric|invalid/i)
})

