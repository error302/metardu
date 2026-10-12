import { mkdir, writeFile } from 'node:fs/promises'
import { analyseCadTopology } from '@/lib/cad/cadTopologyAnalysis'
import type { CadTopologyInput } from '@/lib/cad/cadTopologyProtocol'

type Point = [string, number, number]
type Edge = [string, string]
function input(points: Point[], edges: Edge[], scale = 1, grid = true): CadTopologyInput {
  return { width: 1122, height: 794, metersPerPixel: scale,
    ...(grid ? { originEasting: 499539, originNorthing: 297, coordinateReferenceSystem: 'EPSG:32636' } : {}),
    beacons: points.map(([id,x,y]) => ({ id, label: id, x, y, ...(grid ? { easting: 499539+x*scale, northing: 297+(794-y)*scale } : {}) })),
    boundaries: edges.map(([fromId,toId],i) => ({ id:`edge-${i}`, fromId, toId, type:'standard' })) }
}
const square: Point[] = [['QA-A',561,397],['QA-B',661,397],['QA-C',661,497],['QA-D',561,497]]
const perimeter: Edge[] = [['QA-A','QA-B'],['QA-B','QA-C'],['QA-C','QA-D'],['QA-D','QA-A']]
const adjacent = input([...square,['QA-E',761,397],['QA-F',761,497]], [...perimeter,['QA-B','QA-E'],['QA-E','QA-F'],['QA-F','QA-C']])
const unknownScale = input(square,perimeter,1,false)
delete unknownScale.metersPerPixel
const cases = [
  {name:'adjacent-100m-squares',input:adjacent},
  {name:'nested-rings',input:input([...square,['i',586,422],['j',636,422],['k',636,472],['l',586,472]],[...perimeter,['i','j'],['j','k'],['k','l'],['l','i']])},
  {name:'square-with-dangling-edge',input:input([...square,['e',761,397]],[...perimeter,['QA-B','e']])},
  {name:'disconnected-squares',input:input([...square,['e',861,397],['f',961,397],['g',961,497],['h',861,497]],[...perimeter,['e','f'],['f','g'],['g','h'],['h','e']])},
  {name:'scaled-drawing-half-metre',input:input(square,perimeter,0.5,false)},
  {name:'unscaled-drawing',input:unknownScale},
  {name:'unsplit-crossing',input:input(square,[['QA-A','QA-C'],['QA-C','QA-B'],['QA-B','QA-D'],['QA-D','QA-A']])},
  {name:'unsplit-t-junction',input:input([...square,['e',611,397],['f',611,347]],[...perimeter,['e','f']])},
]
test('exports actual source-engine cases for independent native comparison', async () => {
  await mkdir('test-results/cad-topology',{recursive:true})
  await writeFile('test-results/cad-topology/source-engine.json',JSON.stringify({synthetic:true,sourceEngine:'analyseCadTopology',cases:cases.map(item=>({...item,result:analyseCadTopology(item.input)}))},null,2)+'\n')
  console.log(`Wrote ${cases.length} actual source-engine results for independent native comparison.`)
  expect(cases).toHaveLength(8)
})

