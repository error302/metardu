import { engineeringScheduleCsv } from '../engineeringScheduleCsv'
import { parseRoadStationsCSV } from '../roadProjectOutputs'

it('round trips negative observed offsets and explicit zero design RL without spreadsheet apostrophes', () => {
  const csv = engineeringScheduleCsv(['chainage', 'offset', 'ground_level', 'design_level'], [[0, -10, 1, 0], [0, 0, 1, 0], [0, 10, 1, 0]])
  expect(parseRoadStationsCSV(csv)[0].groundProfile?.[0]).toEqual({ offset: -10, level: 1 })
})
it('escapes formula-bearing textual labels while retaining finite numeric measurements', () => {
  expect(engineeringScheduleCsv(['label', 'value'], [['=1+1', -2]])).toContain('"\'=1+1","-2"')
})
