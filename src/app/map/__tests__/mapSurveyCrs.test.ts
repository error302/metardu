import { resolveMapSurveyCrs } from '../mapSurveyCrs'

const ARC_1960_UTM_36S = 'EPSG:21036'
const DISPLAY_CRS = 'EPSG:3857'
const WGS84_UTM_37S = 'EPSG:32737'
const UNKNOWN_CRS = 'EPSG:999999'

describe('resolveMapSurveyCrs', () => {
  it('uses the saved project CRS regardless of the display projection', () => {
    expect(resolveMapSurveyCrs({
      projectId: 'project-1',
      declaredProjectCrs: ARC_1960_UTM_36S,
      selectedUnlinkedSurveyCrs: DISPLAY_CRS,
    })).toBe(ARC_1960_UTM_36S)
  })

  it('does not borrow the display projection when a linked project has no declared CRS', () => {
    expect(resolveMapSurveyCrs({
      projectId: 'project-1',
      declaredProjectCrs: null,
      selectedUnlinkedSurveyCrs: WGS84_UTM_37S,
    })).toBeNull()
  })

  it('requires an explicit projected map grid for an unlinked map', () => {
    expect(resolveMapSurveyCrs({
      projectId: null,
      declaredProjectCrs: null,
      selectedUnlinkedSurveyCrs: DISPLAY_CRS,
    })).toBeNull()

    expect(resolveMapSurveyCrs({
      projectId: null,
      declaredProjectCrs: null,
      selectedUnlinkedSurveyCrs: WGS84_UTM_37S,
    })).toBe(WGS84_UTM_37S)
  })

  it('rejects unknown and display-only project CRS values', () => {
    expect(() => resolveMapSurveyCrs({
      projectId: 'project-1',
      declaredProjectCrs: DISPLAY_CRS,
      selectedUnlinkedSurveyCrs: WGS84_UTM_37S,
    })).toThrow(/display projection/i)

    expect(() => resolveMapSurveyCrs({
      projectId: null,
      declaredProjectCrs: null,
      selectedUnlinkedSurveyCrs: UNKNOWN_CRS,
    })).toThrow(/not registered/i)
  })
})
