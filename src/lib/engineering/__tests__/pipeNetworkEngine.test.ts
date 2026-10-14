import {
  calculatePipeHydraulics,
  solvePartialFlow,
  calculatePipeCover,
  analyzeManholeDrops,
  calculateRationalRunoff,
  autoGradeNetwork,
  autoSizePipe,
  generateNetworkDXF,
  generatePipeSetoutStations,
  classifyPipeFlowStatus,
  calculatePipeAlignmentLengthM,
  calculatePressurizedPipeProfile,
  validatePipeNetwork,
  Manhole,
  Pipe,
} from '../pipeNetworkEngine'
import { SRID_21037 } from '@/lib/map/projectionConstants'

describe('pipeNetworkEngine', () => {
  it('computes Manning full flow capacity and velocity', () => {
    // 300mm concrete pipe on 1% slope (0.01 m/m)
    const { capacity, velocity } = calculatePipeHydraulics(300, 0.01, 'Concrete')
    expect(capacity).toBeGreaterThan(0.05) // m3/s (>50 L/s)
    expect(velocity).toBeGreaterThan(0.75)
  })

  it('solves circular partial flow depth ratio and actual velocity', () => {
    // 300mm pipe on 1% slope carrying 30 L/s (capacity is ~77 L/s)
    const partial = solvePartialFlow(300, 0.01, 'Concrete', 30)
    expect(partial.depthRatio).toBeGreaterThan(0.2)
    expect(partial.depthRatio).toBeLessThan(0.8)
    expect(partial.actualVelocity).toBeGreaterThan(0.75)
    expect(partial.flowDepthMm).toBeGreaterThan(60)
    expect(partial.flowDepthMm).toBeLessThan(240)
    expect(['Subcritical', 'Critical', 'Supercritical']).toContain(partial.regime)
  })

  it('requires pressure-flow analysis when flow exceeds the maximum free-surface capacity', () => {
    const partial = solvePartialFlow(300, 0.01, 'Concrete', 150)
    expect(partial.depthRatio).toBe(1.0)
    expect(partial.flowCondition).toBe('Pressure flow analysis required')
    expect(partial.froudeNumber).toBeNull()
    expect(partial.regime).toBe('Not assessed')
  })

  it('solves the near-crown free-surface branch above full-pipe capacity', () => {
    const full = calculatePipeHydraulics(300, 0.01, 'Concrete')
    const justBelowFull = solvePartialFlow(300, 0.01, 'Concrete', full.capacity * 1000 * 0.99)
    const justFull = solvePartialFlow(300, 0.01, 'Concrete', full.capacity * 1000)
    const withinSolverToleranceFlow = full.capacity * 1000 * (1 + 5e-13)
    const withinSolverTolerance = solvePartialFlow(300, 0.01, 'Concrete', withinSolverToleranceFlow)
    const flowLs = full.capacity * 1000 * 1.03
    const partial = solvePartialFlow(300, 0.01, 'Concrete', flowLs)
    const atFreeSurfaceMaximum = solvePartialFlow(300, 0.01, 'Concrete', partial.maxFreeSurfaceCapacityLs)

    // At or below the full-pipe Manning rate, retain the conventional
    // lower-depth normal-flow solution. Above it, use the upper root.
    expect(justBelowFull.flowCondition).toBe('Free surface')
    expect(justBelowFull.depthRatio).toBeLessThan(0.938)
    expect(justFull.flowCondition).toBe('Free surface')
    expect(justFull.depthRatio).toBeGreaterThan(0.8)
    expect(justFull.depthRatio).toBeLessThan(0.938)
    expect(classifyPipeFlowStatus(withinSolverToleranceFlow, full.capacity * 1000, withinSolverTolerance)).toBe('Within Screening Range')

    expect(partial.flowCondition).toBe('Free surface')
    expect(partial.depthRatio).toBeGreaterThan(0.938)
    expect(partial.depthRatio).toBeLessThan(1)
    expect(partial.maxFreeSurfaceCapacityLs / (full.capacity * 1000)).toBeCloseTo(1.0757, 4)
    expect(partial.regime).not.toBe('Not assessed')
    expect(classifyPipeFlowStatus(flowLs, full.capacity * 1000, partial)).toBe('Near-Crown Free-Surface Flow')
    expect(atFreeSurfaceMaximum.flowCondition).toBe('Free surface')
    expect(atFreeSurfaceMaximum.depthRatio).toBeCloseTo(0.938, 3)
  })

  it('classifies flow above the open-channel maximum as requiring pressure-flow analysis', () => {
    const full = calculatePipeHydraulics(300, 0.01, 'Concrete')
    const flowLs = full.capacity * 1000 * 1.08
    const partial = solvePartialFlow(300, 0.01, 'Concrete', flowLs)

    expect(partial.flowCondition).toBe('Pressure flow analysis required')
    expect(classifyPipeFlowStatus(flowLs, full.capacity * 1000, partial)).toBe('Open-Channel Capacity Exceeded')
  })

  it('calculates a bounded full-bore HGL upstream from an entered outfall boundary and junction loss', () => {
    const manholes: Manhole[] = [
      { id: 'A', easting: 0, northing: 0, groundLevel: 12, invertOut: 10 },
      { id: 'B', easting: 25, northing: 0, groundLevel: 11.75, invertIn: 9.75, invertOut: 9.75, junctionLossK: 0.5 },
      { id: 'C', easting: 50, northing: 0, groundLevel: 11.5, invertIn: 9.5 },
    ]
    const pipes: Pipe[] = [
      { id: 'P1', fromId: 'A', toId: 'B', diameterMm: 300, material: 'Concrete', designFlowLs: 150 },
      { id: 'P2', fromId: 'B', toId: 'C', diameterMm: 300, material: 'Concrete', designFlowLs: 150 },
    ]

    const [p1, p2] = calculatePressurizedPipeProfile(manholes, pipes, 9.85)
    const diameterM = 0.3
    const area = Math.PI * diameterM ** 2 / 4
    const velocity = 0.15 / area
    const radius = diameterM / 4
    const frictionSlope = ((0.15 * 0.013) / (area * radius ** (2 / 3))) ** 2
    const frictionLoss = frictionSlope * 25
    const junctionLoss = 0.5 * velocity ** 2 / (2 * 9.80665)

    expect(p2.downstreamHglM).toBeCloseTo(9.85, 8)
    expect(p2.upstreamHglM).toBeCloseTo(9.85 + frictionLoss, 8)
    expect(p1.downstreamHglM).toBeCloseTo(9.85 + frictionLoss + junctionLoss, 8)
    expect(p1.upstreamHglM).toBeCloseTo(9.85 + 2 * frictionLoss + junctionLoss, 8)
    expect(p1.frictionSlope).toBeCloseTo(frictionSlope, 10)
  })

  it('requires explicit junction losses and rejects mixed-flow or discontinuous-flow routes', () => {
    const manholes: Manhole[] = [
      { id: 'A', easting: 0, northing: 0, groundLevel: 12, invertOut: 10 },
      { id: 'B', easting: 25, northing: 0, groundLevel: 11.75, invertIn: 9.75, invertOut: 9.75 },
      { id: 'C', easting: 50, northing: 0, groundLevel: 11.5, invertIn: 9.5 },
    ]
    const pipes: Pipe[] = [
      { id: 'P1', fromId: 'A', toId: 'B', diameterMm: 300, material: 'Concrete', designFlowLs: 150 },
      { id: 'P2', fromId: 'B', toId: 'C', diameterMm: 300, material: 'Concrete', designFlowLs: 150 },
    ]

    expect(() => calculatePressurizedPipeProfile(manholes, pipes, 9.85)).toThrow(/junction loss K/i)
    expect(() => calculatePressurizedPipeProfile([
      manholes[0], { ...manholes[1], junctionLossK: 0.5 }, manholes[2],
    ], [pipes[0], { ...pipes[1], designFlowLs: 20 }], 9.85)).toThrow(/same design flow/i)
    expect(() => calculatePressurizedPipeProfile([
      manholes[0], { ...manholes[1], junctionLossK: 0.5 }, manholes[2],
    ], [pipes[0], { ...pipes[1], diameterMm: 900 }], 9.85)).toThrow(/only handles full-bore pressure flow/i)
  })

  it('rejects an outfall boundary that does not maintain the full-bore crown assumption', () => {
    const manholes: Manhole[] = [
      { id: 'A', easting: 0, northing: 0, groundLevel: 11, invertOut: 10 },
      { id: 'B', easting: 25, northing: 0, groundLevel: 10.75, invertIn: 9.75 },
    ]
    const pipe: Pipe = { id: 'P1', fromId: 'A', toId: 'B', diameterMm: 300, material: 'Concrete', designFlowLs: 150 }
    expect(() => calculatePressurizedPipeProfile(manholes, [pipe], 9.9)).toThrow(/falls below the pipe crown/i)
  })

  it('calculates pipe cover depth and detects shallow cover hazards', () => {
    const mh1: Manhole = { id: 'MH1', easting: 1000, northing: 2000, groundLevel: 100.0, invertOut: 99.4 } // cover = 100 - (99.4 + 0.3) = 0.3m (shallow!)
    const mh2: Manhole = { id: 'MH2', easting: 1050, northing: 2000, groundLevel: 99.5, invertIn: 98.9 }
    const pipe: Pipe = { id: 'P1', fromId: 'MH1', toId: 'MH2', diameterMm: 300, outsideDiameterMm: 315, material: 'Concrete', designFlowLs: 40 }

    const cover = calculatePipeCover(pipe, mh1, mh2, 1.0)
    expect(cover.status).toBe('Below Criterion')
    expect(cover.minCover).toBeLessThan(1.0)
  })

  it('detects daylighting pipe hazard when crown exceeds ground', () => {
    const mh1: Manhole = { id: 'MH1', easting: 1000, northing: 2000, groundLevel: 100.0, invertOut: 100.2 } // crown = 100.5 > GL 100.0
    const mh2: Manhole = { id: 'MH2', easting: 1050, northing: 2000, groundLevel: 99.5, invertIn: 99.0 }
    const pipe: Pipe = { id: 'P1', fromId: 'MH1', toId: 'MH2', diameterMm: 300, outsideDiameterMm: 315, material: 'Concrete', designFlowLs: 40 }

    const cover = calculatePipeCover(pipe, mh1, mh2, 1.0)
    expect(cover.status).toBe('Daylight')
  })

  it('reports positive and adverse manhole invert steps without prescribing a structure', () => {
    const manholes: Manhole[] = [
      { id: 'MH-INLET', easting: 1000, northing: 2000, groundLevel: 100, invertOut: 98.5 },
      { id: 'MH-DROP', easting: 1050, northing: 2000, groundLevel: 99, invertIn: 98.0, invertOut: 97.2 },
      { id: 'MH-ADVERSE', easting: 1100, northing: 2000, groundLevel: 98, invertIn: 96.5, invertOut: 96.8 }, // Adverse step (-0.3m)
      { id: 'MH-OUT', easting: 1150, northing: 2000, groundLevel: 97, invertIn: 96.0 },
    ]

    const analysis = analyzeManholeDrops(manholes)
    expect(analysis.find((a) => a.manholeId === 'MH-DROP')?.type).toBe('Positive Step')
    expect(analysis.find((a) => a.manholeId === 'MH-ADVERSE')?.type).toBe('Adverse Step')
  })

  it('calculates Rational Method storm runoff Q = CIA / 360', () => {
    // C = 0.90 (asphalt/roofs), I = 100 mm/hr, A = 2.0 Hectares
    // Q = (0.90 * 100 * 2.0) / 360 = 0.50 m3/s = 500 L/s
    const runoff = calculateRationalRunoff(0.90, 100, 2.0)
    expect(runoff.flowM3s).toBeCloseTo(0.5, 3)
    expect(runoff.flowLs).toBeCloseTo(500, 1)
  })

  it('auto-grades continuous gravity inverts along the network run', () => {
    const manholes: Manhole[] = [
      { id: 'MH1', easting: 1000, northing: 2000, groundLevel: 105.0 },
      { id: 'MH2', easting: 1050, northing: 2000, groundLevel: 104.0 }, // 50m dist
      { id: 'MH3', easting: 1100, northing: 2000, groundLevel: 103.0 }, // 50m dist
    ]
    const pipes: Pipe[] = [
      { id: 'P1', fromId: 'MH1', toId: 'MH2', diameterMm: 300, outsideDiameterMm: 315, material: 'Concrete', designFlowLs: 50 },
      { id: 'P2', fromId: 'MH2', toId: 'MH3', diameterMm: 300, outsideDiameterMm: 315, material: 'Concrete', designFlowLs: 50 },
    ]

    const { manholes: graded } = autoGradeNetwork(manholes, pipes, {
      targetSlopePercent: 1.0, // 1% slope = 0.5m fall per 50m
      minCoverM: 1.2,
      manholeDropM: 0.03, // 30mm benching drop
    })

    // Exact start = 105 - 1.2 - (300 + 315) / 2000 = 103.4925, displayed to millimetres.
    expect(graded[0].invertOut).toBeCloseTo(103.492, 3)
    expect(graded[1].invertIn).toBeCloseTo(102.992, 3)
    expect(graded[1].invertOut).toBeCloseTo(102.962, 3)
    expect(graded[2].invertIn).toBeCloseTo(102.462, 3)
  })

  it('uses developed alignment length for hydraulic grade and auto-grading', () => {
    const manholes: Manhole[] = [
      { id: 'MH1', easting: 0, northing: 0, groundLevel: 105.0 },
      { id: 'MH2', easting: 50, northing: 0, groundLevel: 104.8 },
    ]
    const pipe: Pipe = {
      id: 'P1', fromId: 'MH1', toId: 'MH2', diameterMm: 300, outsideDiameterMm: 315,
      material: 'Concrete', designFlowLs: 50, alignmentVertices: [{ easting: 25, northing: 30 }],
    }
    const developedLength = 2 * Math.hypot(25, 30)
    expect(calculatePipeAlignmentLengthM(pipe, manholes[0], manholes[1])).toBeCloseTo(developedLength, 6)

    const { manholes: graded, issues } = autoGradeNetwork(manholes, [pipe], {
      targetSlopePercent: 1,
      minCoverM: 1.2,
      manholeDropM: 0,
    })
    expect(issues).toEqual([])
    expect(graded[1].invertIn).toBeCloseTo((graded[0].invertOut as number) - developedLength * 0.01, 3)
  })

  it('auto-sizes pipe diameter to the smallest listed size satisfying full-flow capacity', () => {
    const idealDiam = autoSizePipe(80, 0.01, 'Concrete')
    expect(idealDiam).not.toBeNull()
    if (idealDiam === null) throw new Error('Expected a listed pipe diameter for this test input.')
    expect(idealDiam).toBeGreaterThanOrEqual(300)
    const { capacity } = calculatePipeHydraulics(idealDiam, 0.01, 'Concrete')
    expect(capacity * 1000).toBeGreaterThanOrEqual(80)
  })

  it('generates standard AutoCAD DXF entities for plan and longitudinal profile', () => {
    const manholes: Manhole[] = [
      { id: 'MH1', easting: 1000, northing: 2000, groundLevel: 100, invertOut: 98.5 },
      { id: 'MH2', easting: 1050, northing: 2000, groundLevel: 99, invertIn: 98.0, invertOut: 97.97 },
    ]
    const pipes: Pipe[] = [
      { id: 'P1', fromId: 'MH1', toId: 'MH2', diameterMm: 300, outsideDiameterMm: 315, material: 'Concrete', designFlowLs: 50 },
    ]

    const dxf = generateNetworkDXF(manholes, pipes)
    expect(dxf).toContain('DRAIN_PLAN_MH')
    expect(dxf).toContain('DRAIN_PLAN_PIPE')
    expect(dxf).toContain('DRAIN_PROF_GROUND')
    expect(dxf).toContain('DRAIN_PROF_PIPE')
    expect(dxf).toContain('DRAIN_PROF_SHAFTS')
    expect(dxf).toContain('DRAIN_PROF_GRID')
    expect(dxf).toContain('MH1')
    expect(dxf).toContain('MH2')
    expect(dxf).toContain('DATUM')
    expect(dxf).toContain('ENTITIES')
    expect(dxf).toContain('$INSUNITS')
    expect(dxf).toContain('AC1015')
    expect(dxf).toContain('ENDSEC')
  })

  it('exports every entered bend in the plan and uses routed length for profile chainage', () => {
    const manholes: Manhole[] = [
      { id: 'MH1', easting: 1000, northing: 2000, groundLevel: 100, invertOut: 98.5 },
      { id: 'MH2', easting: 1010, northing: 2010, groundLevel: 99, invertIn: 98.3 },
    ]
    const pipes: Pipe[] = [{
      id: 'P1', fromId: 'MH1', toId: 'MH2', diameterMm: 300, outsideDiameterMm: 315,
      material: 'Concrete', designFlowLs: 50, alignmentVertices: [{ easting: 1010, northing: 2000 }],
    }]

    const dxf = generateNetworkDXF(manholes, pipes, SRID_21037)
    expect(dxf.match(/0\nLINE\n8\nDRAIN_PLAN_PIPE\n/g)).toHaveLength(2)
    expect(dxf).toContain('11\n1020\n21\n1800\n31\n0')
  })

  it('rejects adverse slope instead of turning it into positive flow capacity', () => {
    expect(() => calculatePipeHydraulics(300, -0.01, 'Concrete')).toThrow(/positive in the flow direction/i)
    expect(() => solvePartialFlow(300, -0.01, 'Concrete', 30)).toThrow(/positive in the flow direction/i)
  })

  it('calculates cover but does not claim acceptance until a project requirement is supplied', () => {
    const from: Manhole = { id: 'A', easting: 0, northing: 0, groundLevel: 10, invertOut: 8.5 }
    const to: Manhole = { id: 'B', easting: 10, northing: 0, groundLevel: 9.8, invertIn: 8.2 }
    const pipe: Pipe = { id: 'AB', fromId: 'A', toId: 'B', diameterMm: 300, outsideDiameterMm: 315, material: 'Concrete', designFlowLs: 5 }
    expect(calculatePipeCover(pipe, from, to).status).toBe('Not Assessed')
    expect(calculatePipeCover(pipe, from, to, 1.25).status).toBe('Below Criterion')
    expect(() => calculatePipeCover(pipe)).toThrow(/until both ground levels/i)
  })

  it('reports incomplete survey inputs instead of filling in coordinates or levels', () => {
    const manholes: Manhole[] = [{ id: 'A' }, { id: 'B', easting: 10, northing: 0 }]
    const pipes: Pipe[] = [{ id: 'AB', fromId: 'A', toId: 'B', diameterMm: 300, material: 'Concrete', designFlowLs: 0 }]
    const issues = validatePipeNetwork(manholes, pipes)
    expect(issues.some(issue => /projected Easting and Northing/i.test(issue))).toBe(true)
    expect(issues.some(issue => /ground level/i.test(issue))).toBe(true)
    expect(issues.some(issue => /design flow/i.test(issue))).toBe(true)
  })

  it('rejects invalid runoff assumptions and unserviceable auto-size requests', () => {
    expect(() => calculateRationalRunoff(1.1, 50, 1)).toThrow(/between 0 and 1/i)
    expect(autoSizePipe(1_000_000, 0.01, 'Concrete')).toBeNull()
  })

  it('builds straight-chord set-out points and leaves intermediate ground and cover blank', () => {
    const manholes: Manhole[] = [
      { id: 'A', easting: 100, northing: 200, groundLevel: 12, invertOut: 10 },
      { id: 'B', easting: 110, northing: 200, groundLevel: 11, invertIn: 9 },
    ]
    const pipes: Pipe[] = [{ id: 'AB', fromId: 'A', toId: 'B', diameterMm: 300, material: 'Concrete', designFlowLs: 5 }]
    const stations = generatePipeSetoutStations(manholes, [{ ...pipes[0], outsideDiameterMm: 320 }], 4, 1000)
    expect(stations.map(station => station.pipeChainageM)).toEqual([0, 4, 8, 10])
    expect(stations[1].easting).toBeCloseTo(104)
    expect(stations[1].invertLevelM).toBeCloseTo(9.6)
    // Crown rise above internal invert = (300 + 320) / 2000 = 0.310 m.
    expect(stations[1].crownLevelM).toBeCloseTo(9.91, 8)
    expect(stations[1].runChainageM).toBeCloseTo(1004)
    expect(stations[1].groundLevelM).toBeUndefined()
    expect(stations[1].coverAboveCrownM).toBeUndefined()
    expect(stations[1].groundStatus).toBe('Not surveyed at intermediate station')
    expect(stations[0].groundLevelM).toBe(12)
    expect(stations[3].groundLevelM).toBe(11)
  })

  it('rejects intervals below the station coordinate precision before generating candidates', () => {
    const manholes: Manhole[] = [
      { id: 'A', easting: 100, northing: 200, groundLevel: 12, invertOut: 10 },
      { id: 'B', easting: 110, northing: 200, groundLevel: 11, invertIn: 9 },
    ]
    const pipes: Pipe[] = [{
      id: 'AB', fromId: 'A', toId: 'B', diameterMm: 300, outsideDiameterMm: 315,
      material: 'Concrete', designFlowLs: 5,
    }]

    expect(() => generatePipeSetoutStations(manholes, pipes, Number.MIN_VALUE)).toThrow(/coordinate precision/i)
  })

  it('checks an oversized station schedule before allocating interval candidates', () => {
    const manholes: Manhole[] = [
      { id: 'A', easting: 100, northing: 200, groundLevel: 12, invertOut: 10 },
      { id: 'B', easting: 110, northing: 200, groundLevel: 11, invertIn: 9 },
    ]
    const pipes: Pipe[] = [{
      id: 'AB', fromId: 'A', toId: 'B', diameterMm: 300, outsideDiameterMm: 315,
      material: 'Concrete', designFlowLs: 5,
    }]

    expect(() => generatePipeSetoutStations(manholes, pipes, 0.00001)).toThrow(/limit is 20,000/i)
  })
})

