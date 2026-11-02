import { generateContours } from '@/lib/engine/contours'
import { buildBreaklineTIN } from '../breaklineTIN'
import { generateTINContours } from '../tinContours'

test('Tools and saved terrain use identical constrained contour geometry for the same observations and breakline', () => {
  const samples = Array.from({length: 25}, (_, i) => ({name: 'P'+i, easting: 500000+(i%5)*10, northing: 9850000+Math.floor(i/5)*10, elevation: 100+(i%5)*0.23+Math.floor(i/5)*0.17}))
  const xyz = (p: typeof samples[number]) => ({x:p.easting,y:p.northing,z:p.elevation})
  const tools = generateContours(samples, 0.5, 2.5, [{start:samples[0],end:samples[24]}])
  const saved = generateTINContours(buildBreaklineTIN(samples.map(xyz), [{type:'hard',points:[xyz(samples[0]),xyz(samples[24])]}]), {interval:0.5})
  expect(tools).toEqual(saved.flatMap(level=>level.coordinates.map(path=>({elevation:level.elevation,isIndex:level.isIndex,points:path.map(([easting,northing])=>({easting,northing}))}))))
})
