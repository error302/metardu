const fixtureCrs = 'EPSG:32737'
import { calculateRoadHorizontal, calculateRoadEarthworks, parseRoadStationsCSV, buildRoadSchedules } from '../roadProjectOutputs'
import type { CrossSectionTemplate, IntersectionPoint, StationData } from '@/types/engineering'

const ips: IntersectionPoint[] = [
  { id: 'A', name: 'A', easting: 0, northing: 0, radius: 0 },
  { id: 'PI', name: 'PI', easting: 100, northing: 0, radius: 20 },
  { id: 'B', name: 'B', easting: 100, northing: 100, radius: 0 },
]
const template = { carriagewayWidth: 6, shoulderWidth: 1, camber: 0, shoulderCrossfall: 0,
  cutSlope: '2:1', fillSlope: '1.5:1', subgradeDepth: 0 } as CrossSectionTemplate
const groundProfile = [{ offset: -10, level: 1 }, { offset: 0, level: 1 }, { offset: 10, level: 1 }]
const stations = [0, 20].map(chainage => ({ chainage, groundLevel: 1, designLevel: 0, groundProfile })) as StationData[]

describe('road project survey outputs', () => {
  it('computes one curve at the middle PI, with its own supplied radius and route chainages', () => {
    const result = calculateRoadHorizontal(ips, 1000, fixtureCrs)
    expect(result.issues).toEqual([])
    expect(result.curves).toHaveLength(1)
    expect(result.curves[0]).toMatchObject({ ipId: 'PI', radius: 20, turn: 'left', deflectionAngle: 90 })
    expect(result.curves[0].tangentLength).toBeCloseTo(20, 10)
    expect(result.curves[0].chainageTC).toBeCloseTo(1080, 10)
    expect(result.curves[0].chainageCT).toBeCloseTo(1080 + 10 * Math.PI, 10)
  })
  it('normalizes a north-crossing bearing change to 20 degrees', () => {
    const r = Math.PI / 180
    const points = [
      { ...ips[0], easting: -100 * Math.sin(350 * r), northing: -100 * Math.cos(350 * r) },
      { ...ips[1], easting: 0, northing: 0 },
      { ...ips[2], easting: 100 * Math.sin(10 * r), northing: 100 * Math.cos(10 * r) },
    ]
    expect(calculateRoadHorizontal(points, 0, fixtureCrs).curves[0].deflectionAngle).toBeCloseTo(20, 10)
  })
  it('does not invent curves from two endpoints or missing radii', () => {
    expect(calculateRoadHorizontal([ips[0], ips[2]], 0, fixtureCrs).curves).toEqual([])
    const result = calculateRoadHorizontal([ips[0], { ...ips[1], radius: 0 }, ips[2]], 0, fixtureCrs)
    expect(result.curves).toEqual([])
    expect(result.issues.join(' ')).toMatch(/radius/i)
  })
  it('rejects overlapping tangents and a missing survey CRS', () => {
    expect(calculateRoadHorizontal([ips[0], { ...ips[1], radius: 200 }, ips[2]], 0, fixtureCrs).curves).toEqual([])
    expect(calculateRoadHorizontal(ips, 0, '').issues.join(' ')).toMatch(/CRS|reference/i)
  })
  it('blocks finite coordinate inputs whose differences or accumulated chainages overflow', () => {
    const points = [{ ...ips[0], easting: -1e308 }, { ...ips[2], easting: 1e308 }]
    expect(calculateRoadHorizontal(points, 0, fixtureCrs).length).toBeNull()
    expect(calculateRoadHorizontal([{ ...ips[0], easting: 0 }, { ...ips[2], easting: 1e308 }], 1.5e308, fixtureCrs).length).toBeNull()
  })
  it('computes measured flat-ground cut including the supplied side slopes and valid zero design RL', () => {
    const result = calculateRoadEarthworks(stations, template)
    expect(result.issues).toEqual([])
    expect(result.rows.map(row => row.cutArea)).toEqual([10, 10])
    expect(result.totalCut).toBeCloseTo(200, 10)
    expect(result.totalFill).toBe(0)
  })
  it('requires measured offset profiles and design levels instead of substituting zeros', () => {
    const result = calculateRoadEarthworks([{ chainage: 0, groundLevel: 100 }, { chainage: 20, groundLevel: 101 }], template)
    expect(result.rows).toEqual([])
    expect(result.issues.join(' ')).toMatch(/design|profile/i)
  })
  it('does not bridge an invalid middle section with an invented volume', () => {
    const result = calculateRoadEarthworks([stations[0], { chainage: 10, groundLevel: 1 }, stations[1]], template)
    expect(result.rows).toEqual([])
    expect(result.totalCut).toBeNull()
  })
  it('blocks missing daylight observations and duplicate chainages', () => {
    const clipped = stations.map(s => ({ ...s, groundProfile: [{ offset: -4, level: 1 }, { offset: 4, level: 1 }] }))
    expect(calculateRoadEarthworks(clipped, template).issues.join(' ')).toMatch(/daylight|extend/i)
    expect(calculateRoadEarthworks([stations[0], stations[0]], template).issues.join(' ')).toMatch(/chainage/i)
  })
  it('imports explicit zero design levels and keeps unknown levels unknown', () => {
    const result = parseRoadStationsCSV('chainage,ground_level,design_level\r\n0,1,0\r\n20,2,')
    expect(result[0].designLevel).toBe(0)
    expect(result[1].designLevel).toBeUndefined()
  })
  it('rejects suffixed decimals and partially invalid CSVs atomically', () => {
    expect(() => parseRoadStationsCSV('chainage,ground_level\n0,1\n20,2m')).toThrow(/row 3/i)
    expect(() => parseRoadStationsCSV('chainage,ground_level\n0,1\n0,2')).toThrow(/chainage/i)
  })
  it('groups measured CSV offsets by chainage without dropping the ground profile or zero design RL', () => {
    const text = 'chainage,offset,ground_level,design_level\n0,-10,1,0\n0,0,1,0\n0,10,1,0\n20,-10,1,0\n20,0,1,0\n20,10,1,0'
    const rows = parseRoadStationsCSV(text)
    expect(rows).toHaveLength(2)
    expect(rows[0].groundProfile).toEqual(groundProfile)
    expect(calculateRoadEarthworks(rows, template).totalCut).toBe(200)
  })
  it('exports current computed quantities instead of stale stored earthworks', () => {
    const road = { ips, stations, startChainage: 0, crossSectionTemplate: template,
      vips: [], earthworksTable: [{ chainage: 0, cutArea: 999999 }] } as unknown as import('@/types/engineering').RoadDesignData
    const schedules = buildRoadSchedules(road, fixtureCrs)
    expect(schedules.earthworks.rows[1][5]).toBe(200)
    expect(schedules.earthworks.rows.flat()).not.toContain(999999)
    expect(schedules.profiles.rows).toHaveLength(6)
  })
  it('exports exact evaluated vertical targets and keeps the selected source through profile CSV re-import', () => {
    const road = { ips: [ips[0], { ...ips[2], easting:200, northing:0 }], stations: stations.map(s => ({ ...s, chainage: s.chainage + 50, designLevel:999, designLevelSource:'vertical-alignment' as const })), startChainage:0, crossSectionTemplate:template,
      vips:[{id:'a',chainage:0,reducedLevel:0},{id:'p',chainage:100,reducedLevel:2,curveLength:100},{id:'b',chainage:200,reducedLevel:0}], verticalStationIntervalM:25 } as unknown as import('@/types/engineering').RoadDesignData
    const schedules = buildRoadSchedules(road, fixtureCrs, 'Declared BM')
    expect(schedules.verticalStations.rows.find(row => row[0] === 100)?.[1]).toBe(1.5)
    expect(schedules.centrelineSetout.rows.find(row => row[0] === 100)?.slice(1,4)).toEqual([100,0,1.5])
    expect(schedules.stationLevels.rows[0]).toEqual([50, 1, 1, 'vertical-alignment'])
    const csv = [schedules.profiles.headers, ...schedules.profiles.rows].map(row => row.join(',')).join('\n')
    expect(parseRoadStationsCSV(csv)[0].designLevelSource).toBe('vertical-alignment')
  })
})
