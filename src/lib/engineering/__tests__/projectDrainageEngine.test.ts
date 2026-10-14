import { calculateProjectDrainageRuns, drainagePipeGradeContext, generateProjectDrainageSetout } from '../projectDrainageEngine'
import { manningPipeCapacity } from '../drainageDesign'
import type { Manhole } from '@/types/engineering'
import { SRID_21037, SRID_32737, SRID_3857 } from '@/lib/map/projectionConstants'

const validManholes = (): Manhole[] => [
  {
    id: 'A', name: 'MH-A', chainage: 100, easting: 500000, northing: 9800000, coverLevel: 102,
    invertLevelOut: 100, pipeDiameterOut: 300, pipeOutsideDiameterOut: 315, pipeMaterial: 'Concrete', designFlowOutLs: 50,
  },
  { id: 'B', name: 'MH-B', chainage: 200, easting: 500100, northing: 9800000, coverLevel: 101, invertLevelIn: 99 },
]

describe('project drainage run calculations', () => {
  it('records design fall along the generated alignment without assessing unmeasured ground', () => {
    const result = generateProjectDrainageSetout({ projectCrs: SRID_21037, minimumCoverM: 1.2,
      setoutIntervalM: 50, manholes: validManholes() })
    expect(result.issues).toEqual([])
    expect(drainagePipeGradeContext(result.stations).get('MH-A-MH-B')).toEqual({
      pipeLengthM: 100, pipeFallM: 1, pipeGradientPercent: 1,
    })
    expect(result.stations[1].coverAboveCrownM).toBeUndefined()
    expect(drainagePipeGradeContext(result.stations.filter(station => station.stationRole !== 'Pipe end')).size).toBe(0)
    expect(drainagePipeGradeContext(result.stations.map(station => ({ ...station, invertLevelM: 100 }))).size).toBe(0)
  })
  it('uses measured chainages and the upstream outgoing/downstream incoming inverts', () => {
    const { runs, issues } = calculateProjectDrainageRuns(validManholes())
    expect(issues).toEqual([])
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      fromMH: 'MH-A', toMH: 'MH-B', length: 100, gradient: 1,
      internalDiameterMm: 300, material: 'Concrete', manningN: 0.013,
      designFlowLs: 50, capacityStatus: 'Within supplied full-bore capacity',
    })
    const expected = manningPipeCapacity({ diameter: 300, manningN: 0.013, slope: 0.01 })
    expect(runs[0].velocity).toBe(expected.fullBoreVelocity)
    expect(runs[0].fullBoreCapacity).toBe(expected.fullBoreCapacity)
  })

  it('records a comparison only when a design flow is supplied', () => {
    const manholes = validManholes()
    delete manholes[0].designFlowOutLs
    const { runs, issues } = calculateProjectDrainageRuns(manholes)
    expect(issues).toEqual([])
    expect(runs[0].capacityStatus).toBe('No design flow supplied')
    expect(runs[0].designFlowLs).toBeUndefined()
  })

  it('distinguishes near-crown free-surface flow from pressure-flow demand', () => {
    const manholes = validManholes()
    manholes[0].designFlowOutLs = 100
    const nearCrown = calculateProjectDrainageRuns(manholes)

    expect(nearCrown.issues).toEqual([])
    expect(nearCrown.runs[0].capacityStatus).toBe('Above full-bore rate; near-crown free-surface flow')
    expect(nearCrown.runs[0].partialFlow?.flowCondition).toBe('Free surface')
    expect(nearCrown.runs[0].partialFlow?.depthRatio).toBeGreaterThan(0.938)
    expect(nearCrown.runs[0].partialFlow?.maxFreeSurfaceCapacityLs).toBeGreaterThan(100)

    manholes[0].designFlowOutLs = 110
    const pressureDemand = calculateProjectDrainageRuns(manholes)
    expect(pressureDemand.runs[0].capacityStatus).toBe('Exceeds open-channel capacity; pressure-flow analysis required')
    expect(pressureDemand.runs[0].partialFlow?.flowCondition).toBe('Pressure flow analysis required')
    expect(pressureDemand.runs[0].partialFlow?.froudeNumber).toBeNull()
  })

  it('fails closed on missing survey/design inputs without inventing elevations', () => {
    const { runs, issues } = calculateProjectDrainageRuns([{ id: 'A', name: 'MH-A' }, { id: 'B', name: 'MH-B' }])
    expect(runs).toEqual([])
    expect(issues.join(' ')).toMatch(/chainage/)
    expect(issues.join(' ')).toMatch(/outgoing invert/)
    expect(issues.join(' ')).toMatch(/incoming invert/)
    expect(issues.join(' ')).toMatch(/internal diameter/)
  })

  it('rejects duplicate/non-increasing chainage and non-positive gravity fall', () => {
    const equalChainage = validManholes()
    equalChainage[1].chainage = equalChainage[0].chainage
    const equalResult = calculateProjectDrainageRuns(equalChainage)
    expect(equalResult.runs).toEqual([])
    expect(equalResult.issues.some(issue => /chainage must increase/i.test(issue))).toBe(true)

    const adverse = validManholes()
    adverse[1].invertLevelIn = 100.1
    const adverseResult = calculateProjectDrainageRuns(adverse)
    expect(adverseResult.runs).toEqual([])
    expect(adverseResult.issues.some(issue => /must be above/i.test(issue))).toBe(true)
  })

  it('allows explicit roughness and identifies when supplied flow exceeds the calculated reference', () => {
    const manholes = validManholes()
    manholes[0].pipeManningN = 0.02
    manholes[0].designFlowOutLs = 1000
    const { runs, issues } = calculateProjectDrainageRuns(manholes)
    expect(issues).toEqual([])
    expect(runs[0].manningN).toBe(0.02)
    expect(runs[0].capacityStatus).toBe('Exceeds open-channel capacity; pressure-flow analysis required')
    expect(runs[0].partialFlow?.froudeNumber).toBeNull()
  })

  it('does not round full-bore capacity upward into a false flow pass', () => {
    const manholes = validManholes()
    // At 1.002% slope, Manning capacity is 96.79741099 L/s. The former
    // 0.0001 m³/s output rounding raised that to 96.8 L/s and passed 96.799.
    manholes[0].designFlowOutLs = 96.799
    manholes[1].invertLevelIn = 98.998
    const { runs, issues } = calculateProjectDrainageRuns(manholes)

    expect(issues).toEqual([])
    expect(runs[0].fullBoreCapacity * 1000).toBeCloseTo(96.79741099, 8)
    expect(runs[0].designFlowLs).toBeGreaterThan(runs[0].fullBoreCapacity * 1000)
    expect(runs[0].capacityStatus).toBe('Above full-bore rate; near-crown free-surface flow')
    expect(runs[0].partialFlow?.flowCondition).toBe('Free surface')
  })

  it('creates straight-run invert and crown set-out while leaving intermediate ground and cover unknown', () => {
    const result = generateProjectDrainageSetout({
      manholes: validManholes(),
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 50,
    })
    expect(result.issues).toEqual([])
    expect(result.stations).toHaveLength(3)
    // 300 mm ID + 7.5 mm wall above the internal invert, not the full 315 mm OD.
    expect(result.stations[0]).toMatchObject({ runChainageM: 100, easting: 500000, northing: 9800000, invertLevelM: 100, crownLevelM: 100.3075, coverAssessment: 'Meets entered criterion at measured manhole' })
    expect(result.stations[1]).toMatchObject({ runChainageM: 150, easting: 500050, northing: 9800000, invertLevelM: 99.5, groundStatus: 'Not surveyed at intermediate station', coverAssessment: 'Not assessed between surveyed manholes' })
    expect(result.stations[1].coverAboveCrownM).toBeUndefined()
    expect(result.stations[2].coverAssessment).toBe('Meets entered criterion at measured manhole')
  })

  it('stations a bent pipe on its entered projected alignment and includes the bend station', () => {
    const manholes = validManholes()
    manholes[0].easting = 500000
    manholes[0].northing = 9800000
    manholes[0].alignmentVerticesOut = [{ easting: 500010, northing: 9800000 }]
    manholes[0].chainage = 100
    manholes[1].easting = 500010
    manholes[1].northing = 9800010
    manholes[1].chainage = 120
    manholes[1].invertLevelIn = 99.8

    const result = generateProjectDrainageSetout({
      manholes,
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 5,
    })

    expect(result.issues).toEqual([])
    expect(result.stations.map(({ easting, northing }) => [easting, northing])).toEqual([
      [500000, 9800000],
      [500005, 9800000],
      [500010, 9800000],
      [500010, 9800005],
      [500010, 9800010],
    ])
    expect(result.stations.map(station => station.runChainageM)).toEqual([100, 105, 110, 115, 120])
    expect(result.stations[2]).toMatchObject({ pipeChainageM: 10, invertLevelM: 99.9, groundStatus: 'Not surveyed at intermediate station' })
    expect(result.stations[2].coverAboveCrownM).toBeUndefined()
  })

  it('warns that saved map-line alignments need design and survey-control review', () => {
    const manholes = validManholes()
    manholes[0].alignmentVerticesOut = [{ easting: 500010, northing: 9800000 }]
    manholes[0].alignmentSourceOut = {
      kind: 'saved_project_map_line',
      featureKey: 'map-line:storm-main:abc123',
      label: 'Storm main',
      sourceCrs: 'EPSG:4326',
      projectCrs: SRID_21037,
      orientation: 'reversed',
      startConnectorM: 0.25,
      endConnectorM: 0.5,
    }

    const result = generateProjectDrainageSetout({
      manholes,
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 50,
    })

    expect(result.issues).toEqual([])
    expect(result.warnings.join(' ')).toMatch(/saved map line “Storm main”/)
    expect(result.warnings.join(' ')).toMatch(/connectors are 0.250 m and 0.500 m/)
    expect(result.warnings.join(' ')).toMatch(/not verified design or survey control/)
  })

  it('rejects map-line provenance when its stored project CRS differs from the active CRS', () => {
    const manholes = validManholes()
    manholes[0].alignmentSourceOut = {
      kind: 'saved_project_map_line',
      featureKey: 'map-line:storm-main:abc123',
      label: 'Storm main',
      sourceCrs: 'EPSG:4326',
      projectCrs: SRID_32737,
      orientation: 'digitized',
      startConnectorM: 0,
      endConnectorM: 0,
    }

    const result = generateProjectDrainageSetout({
      manholes,
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 50,
    })

    expect(result.stations).toEqual([])
    expect(result.issues.join(' ')).toMatch(new RegExp(`map alignment coordinates use ${SRID_32737}`, 'i'))
  })

  it('rejects map-line provenance attached to a terminal manhole', () => {
    const manholes = validManholes()
    manholes[1].alignmentSourceOut = {
      kind: 'saved_project_map_line',
      featureKey: 'map-line:orphan:abc123',
      label: 'Orphan line',
      sourceCrs: 'EPSG:4326',
      projectCrs: SRID_21037,
      orientation: 'digitized',
      startConnectorM: 0,
      endConnectorM: 0,
    }

    const result = generateProjectDrainageSetout({
      manholes,
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 50,
    })

    expect(result.stations).toEqual([])
    expect(result.issues.join(' ')).toMatch(/must be attached to a pipe with a downstream manhole/i)
  })

  it('creates field coordinates without requiring hydraulic capacity inputs', () => {
    const manholes = validManholes()
    delete manholes[0].pipeDiameterOut
    delete manholes[0].pipeMaterial
    delete manholes[0].designFlowOutLs

    const result = generateProjectDrainageSetout({
      manholes,
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 50,
    })

    expect(result.issues).toEqual([])
    expect(result.stations).toHaveLength(3)
    expect(result.stations[1]).toMatchObject({ easting: 500050, northing: 9800000, invertLevelM: 99.5 })
    expect(result.stations[0].crownLevelM).toBeNull()
    expect(result.stations[0].coverAboveCrownM).toBeUndefined()
    expect(result.stations[0].coverAssessment).toBe('Not assessed: internal diameter unknown')
  })

  it('blocks gravity pipe set-out when the downstream invert is not lower', () => {
    const manholes = validManholes()
    manholes[1].invertLevelIn = 100
    const result = generateProjectDrainageSetout({
      manholes,
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 50,
    })

    expect(result.stations).toEqual([])
    expect(result.issues.join(' ')).toMatch(/upstream invert must fall downstream/i)
  })

  it('caps unreasonable station counts before allocating a huge schedule', () => {
    const result = generateProjectDrainageSetout({
      manholes: validManholes(),
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 0.00001,
    })

    expect(result.stations).toEqual([])
    expect(result.issues.join(' ')).toMatch(/limit is 20,000/i)
  })

  it('blocks set-out until the projected CRS, coordinates, manufacturer outside diameter and criterion are supplied', () => {
    const manholes = validManholes()
    delete manholes[0].easting
    delete manholes[0].pipeOutsideDiameterOut
    const result = generateProjectDrainageSetout({ manholes, projectCrs: SRID_3857, setoutIntervalM: 5 })
    expect(result.stations).toEqual([])
    expect(result.issues.some(issue => /display projection/i.test(issue))).toBe(true)
    expect(result.issues.some(issue => /Easting and Northing/i.test(issue))).toBe(true)
    expect(result.issues.some(issue => /outside diameter/i.test(issue))).toBe(true)
    expect(result.issues.some(issue => /minimum cover criterion/i.test(issue))).toBe(true)
  })

  it('rejects disagreement between the entered chainage increment and alignment length', () => {
    const manholes = validManholes()
    manholes[1].easting = 500115
    const result = generateProjectDrainageSetout({
      manholes,
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 5,
    })
    expect(result.stations).toEqual([])
    expect(result.issues.join(' ')).toMatch(/chainage interval differs from the entered pipe alignment length/i)
  })

  it('blocks a set-out preview when projected coordinates are outside the declared UTM domain', () => {
    const manholes = validManholes()
    manholes[0].easting = 100
    manholes[1].easting = 200
    const result = generateProjectDrainageSetout({
      manholes,
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 50,
    })

    expect(result.stations).toEqual([])
    expect(result.issues.join(' ')).toMatch(/outside the UTM easting domain/i)
  })

  it('keeps nominal-strip coordinate warnings visible without treating them as hard range failures', () => {
    const manholes = validManholes()
    manholes[0].easting = 850000
    manholes[1].easting = 850100
    const result = generateProjectDrainageSetout({
      manholes,
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      setoutIntervalM: 50,
    })

    expect(result.issues).toEqual([])
    expect(result.stations).toHaveLength(3)
    expect(result.warnings.join(' ')).toMatch(/outside the nominal UTM strip/i)
  })
})
