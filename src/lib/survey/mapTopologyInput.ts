import { assertProjectedCrs, transformPoint } from '@/lib/spatial/projectCrs'
import type { SurveyPoint } from '@/lib/map/turfHelpers'

/** OpenLayers view geometry must enter survey checks in the chosen project grid. */
export function mapTopologyVertices(coordinates: readonly number[][], viewCrs: string | null, surveyCrs: string | null): SurveyPoint[] {
  if (!viewCrs) throw new Error('The map view projection is unavailable.')
  if (!surveyCrs) throw new Error('Choose a projected survey reference system before checking topology.')
  if (assertProjectedCrs(surveyCrs).units !== 'metres') throw new Error('Topology requires projected metre coordinates.')
  return coordinates.map(coordinate => {
    if (coordinate.length < 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) throw new Error('Invalid map geometry coordinate.')
    const [easting, northing] = transformPoint(coordinate[0], coordinate[1], viewCrs, surveyCrs)
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) throw new Error('Map geometry could not be transformed.')
    return { easting, northing }
  })
}
