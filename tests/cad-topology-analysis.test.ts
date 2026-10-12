import { analyseCadTopology } from '@/lib/cad/cadTopologyAnalysis'
import type { CadTopologyInput } from '@/lib/cad/cadTopologyProtocol'

function network(points: Array<[string, number, number]>, edges: Array<[string, string]>, patch: Partial<CadTopologyInput> = {}): CadTopologyInput {
  return { width: 1122, height: 794, metersPerPixel: 1, originEasting: 500000, originNorthing: 0, coordinateReferenceSystem: 'EPSG:32636',
    beacons: points.map(([id, x, y]) => ({ id, label: id, x, y, easting: 500000 + x, northing: 794 - y })),
    boundaries: edges.map(([fromId, toId], index) => ({ id: `edge-${index}`, fromId, toId, type: 'standard' })), ...patch }
}
const square: Array<[string, number, number]> = [['a',100,100],['b',200,100],['c',200,200],['d',100,200]]
const squareEdges: Array<[string,string]> = [['a','b'],['b','c'],['c','d'],['d','a']]

test('derives a square face and measured linework while ignoring an unused control', () => {
  const result = analyseCadTopology(network([...square,['control',400,400]], squareEdges))
  expect(result.status).toBe('closed')
  expect(result.faces).toHaveLength(1)
  expect(result.totalAreaM2).toBe(10000)
  expect(result.networkLengthM).toBe(400)
  expect(result.faces[0]).toMatchObject({ areaM2:10000, perimeterM:400 })
})

test('polygonizes two adjacent plots sharing one edge without double-counting linework', () => {
  const result = analyseCadTopology(network([...square,['e',300,100],['f',300,200]], [...squareEdges,['b','e'],['e','f'],['f','c']]))
  expect(result.status).toBe('closed')
  expect(result.faces.map(face => face.areaM2).sort()).toEqual([10000,10000])
  expect(result.totalAreaM2).toBe(20000)
  expect(result.networkLengthM).toBe(700)
  expect(result.faces.map(face => face.perimeterM)).toEqual([400,400])
})

test('reports a closed face plus open linework rather than calling the entire drawing closed', () => {
  const result = analyseCadTopology(network([...square,['e',300,100]], [...squareEdges,['b','e']]))
  expect(result.status).toBe('mixed')
  expect(result.faces).toHaveLength(1)
  expect(result.totalAreaM2).toBe(10000)
  expect(result.networkLengthM).toBe(500)
  expect(result.unenclosedEdgeCount).toBe(1)
})

test('handles nested rings as disjoint bounded faces, with the outer hole removed from its area', () => {
  const points: Array<[string,number,number]> = [...square,['i',125,125],['j',175,125],['k',175,175],['l',125,175]]
  const result = analyseCadTopology(network(points,[...squareEdges,['i','j'],['j','k'],['k','l'],['l','i']]))
  expect(result.faces.map(face => face.areaM2).sort((a,b) => Number(a)-Number(b))).toEqual([2500,7500])
  expect(result.totalAreaM2).toBe(10000)
  expect(result.networkLengthM).toBe(600)
})

test('rejects a bow tie and a junction in the middle of an unbroken edge', () => {
  const bow = analyseCadTopology(network(square,[['a','c'],['c','b'],['b','d'],['d','a']]))
  expect(bow.status).toBe('invalid')
  expect(bow.totalAreaM2).toBeNull()
  const tee = analyseCadTopology(network([...square,['e',150,100],['f',150,50]],[...squareEdges,['e','f']]))
  expect(tee.status).toBe('invalid')
  expect(tee.issues.join(' ')).toMatch(/junction|intersection/i)
})

test('rejects duplicate edges and coincident independent point identities', () => {
  expect(analyseCadTopology(network(square,[...squareEdges,['b','a']])).status).toBe('invalid')
  const duplicate = network([...square,['copy',100,100]],[...squareEdges,['copy','b']])
  expect(analyseCadTopology(duplicate).status).toBe('invalid')
})

test('returns open linework without a fabricated area or closing edge', () => {
  const result = analyseCadTopology(network(square,[['a','b'],['b','c'],['c','d']]))
  expect(result.status).toBe('open')
  expect(result.totalAreaM2).toBeNull()
  expect(result.networkLengthM).toBe(300)
  expect(result.faces).toEqual([])
})

test('suppresses metric results when a declared reference disagrees with its controls', () => {
  const doc = network(square,squareEdges)
  doc.beacons[0].easting = 500101
  const result = analyseCadTopology(doc)
  expect(result.status).toBe('invalid')
  expect(result.totalAreaM2).toBeNull()
  expect(result.networkLengthM).toBeNull()
  expect(result.issues.join(' ')).toMatch(/reference|align/i)
})

test('keeps unscaled sketches unscaled and identifies calibrated drawing metrics separately from a survey grid', () => {
  const doc = network(square,squareEdges,{metersPerPixel:undefined,originEasting:undefined,originNorthing:undefined,coordinateReferenceSystem:undefined})
  expect(analyseCadTopology(doc)).toMatchObject({ status:'closed', basis:'unscaled-drawing', totalAreaM2:null, networkLengthM:null })
  expect(analyseCadTopology({...doc,metersPerPixel:0.5})).toMatchObject({basis:'scaled-drawing', totalAreaM2:2500, networkLengthM:200})
})
