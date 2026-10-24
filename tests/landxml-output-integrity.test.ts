/** @jest-environment node */
import {XMLParser} from 'fast-xml-parser'
import {generateLandXML,type LandXMLPoint} from '@/lib/export/generateLandXML'
import {parseLandXML} from '@/lib/import/totalStation/parseLandXML'
const project={name:'SYNTHETIC XML & coordinate fixture',datum:'WGS84',utm_zone:37,hemisphere:'S'}
const point:LandXMLPoint={name:'P&1',easting:500000,northing:9800000,elevation:null,is_control:false}
test('unknown height remains absent while a measured zero survives an ordinary re-import',()=>{
  const output=generateLandXML(project,[point,{...point,name:'P2',elevation:0}])
  const imported=parseLandXML(output)
  expect(imported.errors).toEqual([])
  expect(imported.records[0]).toMatchObject({pointId:'P&1',easting:500000,northing:9800000})
  expect(imported.records[0].elevation).toBeUndefined()
  expect(imported.records[1].elevation).toBe(0)
})
test.each([NaN,Infinity,-Infinity])('nonfinite coordinate or elevation %s cannot produce a deliverable',value=>{
  expect(()=>generateLandXML(project,[{...point,easting:value}])).toThrow(/finite|coordinate/i)
  expect(()=>generateLandXML(project,[{...point,elevation:value}])).toThrow(/finite|height|elevation/i)
})
test('blank/duplicate names and illegal XML data are refused before download',()=>{
  expect(()=>generateLandXML(project,[{...point,name:' '}])).toThrow(/name/i)
  expect(()=>generateLandXML(project,[point,point])).toThrow(/duplicate|unique/i)
  expect(()=>generateLandXML({...project,name:'bad\u0000name'},[point])).toThrow(/XML/i)
})
test('schema-defined metadata replaces fabricated schema elements',()=>{
  const xml=generateLandXML(project,[point])
  const parsed=new XMLParser({ignoreAttributes:false}).parse(xml) as {LandXML:Record<string,unknown>}
  expect(parsed.LandXML.Units).toBeDefined()
  expect(parsed.LandXML.Application).toBeDefined()
  expect(parsed.LandXML.Header).toBeUndefined()
  expect(parsed.LandXML.Survey).toBeUndefined()
  expect(xml).toContain('horizontalDatum="WGS84"')
  expect(xml).not.toContain('featureCode=')
  expect(xml).not.toContain('<Datum ')
  expect(xml).not.toContain('<VerticalDatum ')
})

test('plan references resolve to retained coordinates and invalid references are refused',()=>{
  const xml=generateLandXML(project,[point,{...point,name:'P2',easting:500001}],
    [{name:'SYNTHETIC line',pointRefs:[point.name,'P2'],metadata:{geometryRole:'line'}}])
  expect(xml).toContain('<Start pntRef="P&amp;1"/>')
  expect(xml).toContain('<End pntRef="P2"/>')
  expect(()=>generateLandXML(project,[point],[{name:'missing',pointRefs:[point.name,'missing']}])).toThrow(/references/i)
})

test('source metadata cannot override declared coordinate provenance',()=>{
  const xml=generateLandXML({...project,metadata:{zone:'1',verticalReference:'pretend'}},[point])
  expect(xml).toContain('label="zone" value="37"')
  expect(xml).not.toContain('value="pretend"')
})
