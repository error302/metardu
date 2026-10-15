import { roadAlignmentMirrorPayload, roadFromAlignmentMirror } from '../roadAlignmentMirror'
import { buildRoadSchedules } from '../roadProjectOutputs'
import type { RoadDesignData } from '@/types/engineering'

const fixtureCrs = 'EPSG:32737'
const road: RoadDesignData = { roadName: 'Synthetic', startChainage: 0, datum: 'Declared', coordinateSystem: fixtureCrs, roadClass: 'C', designSpeed: 40,
  verticalStationIntervalM: 20, ips: [{ id: 'source-A', name: 'A', easting: 0, northing: 0, radius: 0 }, { id: 'source-PI', name: 'PI', easting: 0, northing: 1000, radius: 300, hasTransition: true, transitionLengthIn: 60, transitionLengthOut: 60 }, { id: 'source-B', name: 'B', easting: 1000, northing: 1000, radius: 0 }],
  vips: [{ id: 'source-VIP', chainage: 0, reducedLevel: 0, curveLength: 50 }], crossSectionTemplate: { carriagewayWidth: 6, shoulderWidth: 1, shoulderCrossfall: 0, camber: 0, cutSlope: '2:1', fillSlope: '2:1', subgradeDepth: 0 },
  stations: [{ chainage: 0, groundLevel: 0, designLevel: -1, designLevelSource: 'manual', groundProfile: [{ offset: -10, level: 0 }, { offset: 0, level: 0 }, { offset: 10, level: 0 }] }] }

it('round trips complete template, source identities, transitions, profile geometry and zero observations', () => {
  const payload = roadAlignmentMirrorPayload(road, 'project')
  const saved = roadFromAlignmentMirror({ ...payload.header, id: 'alignment', datum: 'Declared', coordinate_system: fixtureCrs,
    ips: payload.ips.map((row, i) => ({ ...row, id: `database-${i}` })), vips: payload.vips.map(row => ({ ...row, id: 'database-vip' })),
    stations: payload.stations.map(row => ({ chainage: row.chainage, ground_level: row.ground_level,
      existing_ground: { level: row.ground_level, profile: row.ground_profile }, proposed_road: { designLevel: row.design_level, designLevelSource: row.design_level_source } })) })
  expect(saved.ips).toEqual(road.ips.map(ip => ({ ...ip, hasTransition: ip.hasTransition ?? false })))
  expect(saved.vips[0]).toMatchObject({ id: 'source-VIP', reducedLevel: 0, curveLength: 50 })
  expect(saved.crossSectionTemplate).toEqual(road.crossSectionTemplate)
  expect(saved.stations).toEqual(road.stations)
  expect(saved.verticalStationIntervalM).toBe(20)
  expect(buildRoadSchedules(saved, fixtureCrs, 'BM').horizontal.rows).toEqual(buildRoadSchedules(road, fixtureCrs, 'BM').horizontal.rows)
})

it('retains explicit empty snapshots and never invents missing template levels, speed or reference', () => {
  const payload = roadAlignmentMirrorPayload({ ...road, ips: [], vips: [], stations: [] }, 'project')
  expect(payload.ips).toEqual([]); expect(payload.vips).toEqual([]); expect(payload.stations).toEqual([])
  const saved = roadFromAlignmentMirror({ id: 'alignment', stations: [{ chainage: 0, ground_level: null }] })
  expect(saved.coordinateSystem).toBe(''); expect(saved.datum).toBe('')
  expect(Number.isNaN(saved.designSpeed)).toBe(true)
  expect(Number.isNaN(saved.crossSectionTemplate.camber)).toBe(true)
  expect(Number.isNaN(saved.stations[0].groundLevel)).toBe(true)
  expect(saved.stations[0].designLevel).toBeUndefined()
})

it('reads original complete legacy JSON templates but rejects malformed source JSON', () => {
  expect(roadFromAlignmentMirror({ cross_section_template: JSON.stringify(road.crossSectionTemplate) }).crossSectionTemplate).toEqual(road.crossSectionTemplate)
  expect(() => roadFromAlignmentMirror({ cross_section_template: '{truncated' })).toThrow()
})

it('does not coerce malformed observation objects or blanks into zero', () => {
  for (const value of [null, '', ' ', [], {}, true, '0m']) {
    expect(Number.isNaN(roadFromAlignmentMirror({ start_chainage: value }).startChainage)).toBe(true)
  }
})
