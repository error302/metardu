import { createPipeNetworkProjectData, PipeNetworkProjectSchema } from '../pipeNetworkPersistence'
import { SRID_21037 } from '@/lib/map/projectionConstants'

describe('pipe network project persistence', () => {
  it('round-trips the projected route and user-entered design settings', () => {
    const network = createPipeNetworkProjectData({
      projectCrs: SRID_21037,
      minimumCoverM: 1.2,
      stationIntervalM: 5,
      stationStartChainageM: 120,
      outfallHglM: 97.4,
      manholes: [
        { id: 'MH-1', easting: 500000, northing: 9800000, groundLevel: 100, invertOut: 98, junctionLossK: 0.35 },
      ],
      pipes: [{
        id: 'P-1', fromId: 'MH-1', toId: 'MH-2', diameterMm: 300, outsideDiameterMm: 315,
        material: 'HDPE', designFlowLs: 25, alignmentVertices: [{ easting: 500010, northing: 9800000 }],
      }],
    })

    expect(PipeNetworkProjectSchema.parse(network)).toEqual(network)
  })

  it('rejects oversized cumulative route-vertex data before a project write', () => {
    const vertices = Array.from({ length: 20_001 }, (_, index) => ({ easting: 500000 + index, northing: 9800000 }))
    const result = PipeNetworkProjectSchema.safeParse({
      version: 1,
      projectCrs: SRID_21037,
      manholes: [],
      pipes: [{ id: 'P-1', fromId: 'MH-1', toId: 'MH-2', diameterMm: 300, material: 'Concrete', designFlowLs: 0, alignmentVertices: vertices }],
    })

    expect(result.success).toBe(false)
  })

  it('continues to accept version 1 projects that predate pressure profile inputs', () => {
    const legacyNetwork = {
      version: 1 as const,
      projectCrs: SRID_21037,
      manholes: [{ id: 'MH-1', easting: 500000, northing: 9800000, groundLevel: 100, invertOut: 98 }],
      pipes: [{ id: 'P-1', fromId: 'MH-1', toId: 'MH-2', diameterMm: 300, material: 'HDPE' as const, designFlowLs: 25 }],
    }
    expect(PipeNetworkProjectSchema.parse(legacyNetwork)).toEqual(legacyNetwork)
  })
})
