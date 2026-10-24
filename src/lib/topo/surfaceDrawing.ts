/** One entity authority for retained-revision preview and server DXF. */
import { buildTopoEntities } from '@/lib/drawing/topoEntities'
import type { ContourLine } from '@/lib/topo/contourGenerator'
import type { TerrainDomain } from './terrainDomain'

interface SurfaceDrawingSource {
  name: string; revision: number; revisionId: string; inputHash: string; crs: string; verticalDatum: string
  contours: ContourLine[]
  snapshot: { observations: Array<{ id: string; pointName: string | null; x: number; y: number; z: number; code: string | null }>;
    breaklines?: Array<{ points: Array<{x:number;y:number;z:number}> }>; terrainDomain?: (TerrainDomain & { sourceLabel: string }) | null }
  domain?: { area: number; derivedVertexCount: number } | null
}
export function buildSurfaceRevisionDrawing(source: SurfaceDrawingSource) {
  const points = source.snapshot.observations.map(point => ({ id: point.id, pointNumber: point.pointName ?? point.id,
    easting: point.x, northing: point.y, elevation: point.z, code: point.code ?? '' }))
  const span = Math.max(1, Math.max(...points.map(point => point.easting)) - Math.min(...points.map(point => point.easting)),
    Math.max(...points.map(point => point.northing)) - Math.min(...points.map(point => point.northing)))
  const drawing = buildTopoEntities(points, { scale: 1000, includeSpotHeights: true, includeTitleBlock: true,
    includeLabels: true, includeLegend: true, gridTickInterval: Math.max(1, span / 10) }, { projectName: source.name,
    reference: { horizontalCrs: source.crs, verticalDatum: source.verticalDatum }, contours: source.contours })
  const width = drawing.extents.maxX - drawing.extents.minX
  const text = (label: string, row: number) => drawing.entities.push({ kind: 'text', layer: 'ANNOTATIONS',
    e: drawing.extents.minX, n: drawing.extents.minY - width * (0.09 + row * 0.018), height: width * 0.009, text: label })
  text(`Surface R${source.revision} | ${source.revisionId}`, 0)
  text(`Input SHA-256: ${source.inputHash}`, 1)
  text('COMPUTED DRAFT - independent survey review and field acceptance required', 2)
  if (source.snapshot.terrainDomain) {
    drawing.layers.push({name:'TERRAIN_BOUNDARY',colorHex:'#00ff00',lineTypeName:'CONTINUOUS'},{name:'TERRAIN_EXCLUSIONS',colorHex:'#ff0000',lineTypeName:'CONTINUOUS'})
    const drawRing = (ring: Array<{x:number;y:number}>, layer: string) => {
      const pts: Array<[number,number]>=ring.map(point=>[point.x,point.y])
      if(pts.length>3&&pts[0][0]===pts[pts.length-1][0]&&pts[0][1]===pts[pts.length-1][1])pts.pop()
      drawing.entities.push({kind:'polyline',layer,pts,closed:true})
    }
    for(const region of source.snapshot.terrainDomain.regions) {
      drawRing(region.outer,'TERRAIN_BOUNDARY')
      for(const hole of region.holes)drawRing(hole,'TERRAIN_EXCLUSIONS')
    }
    text('Green: outer boundary | red: exclusions (XY definitions)',3)
    text('All reviewed source points support the parent TIN; masks clip terrain geometry.',4)
    if(source.domain)text(`Terrain area: ${source.domain.area.toFixed(3)} m2 | ${source.domain.derivedVertexCount} derived clip vertices`,5)
  }
  if(source.snapshot.breaklines?.length) {
    drawing.layers.push({name:'SURVEY_BREAKLINES_3D',colorHex:'#00ffff',lineTypeName:'CONTINUOUS'})
    for(const line of source.snapshot.breaklines)drawing.entities.push({kind:'polyline3d',layer:'SURVEY_BREAKLINES_3D',pts:line.points.map(point=>[point.x,point.y,point.z])})
    text('Cyan: retained source breaklines (XYZ); source lines are shown whole.',source.snapshot.terrainDomain?6:3)
  }
  return drawing
}
