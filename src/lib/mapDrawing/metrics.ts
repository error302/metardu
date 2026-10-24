import type { FeatureCollection, Geometry, Position } from 'geojson'
import { assertProjectedCrs, surveyArea, surveyDistance, surveyPerimeter, transformPoint, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { isSimplePolygonRing, segmentsIntersect } from '@/lib/spatial/simplePolygon'
import { pointInPolygon } from '@/lib/engine/geometry'

type XY = [number, number]
const MAX_MEASURE_VERTICES = 2000
export interface MapGridMetrics {
  status: 'available' | 'unavailable'
  areaSqM: number | null
  polygonBoundaryLengthM: number | null
  lineLengthM: number | null
  totalLengthM: number | null
  crs: string | null
  reason?: string
}
/** Sum independent drawn features in the stated grid; this is not a polygon union or field accuracy claim. */
export function measureMapGridDrawing(collection: FeatureCollection<Geometry|null>, crs: string | null): MapGridMetrics {
  try {
    if (!crs) throw new Error('A supported project grid is required before map measurements can be stated.')
    const authority = assertProjectedCrs(crs)
    let vertices = 0, areaSqM = 0, polygonBoundaryLengthM = 0, lineLengthM = 0
    const point = (p: Position): XY => {
      if (++vertices > MAX_MEASURE_VERTICES) throw new Error(`Grid measurement is limited to ${MAX_MEASURE_VERTICES} vertices per drawing. The complete geometry is retained without numeric metrics.`)
      if (p.length < 2 || p.some(n => !Number.isFinite(n)) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) throw new Error('A drawing coordinate is not a finite longitude/latitude position.')
      const result = transformPoint(p[0],p[1],'EPSG:4326',authority.code)
      if (!result.every(Number.isFinite) || !validateCoordinateRange(result[0],result[1],authority.code).valid) throw new Error('A drawing coordinate does not fit the stated project grid.')
      return result
    }
    const points = (ring: XY[]) => ring.map(([easting,northing]) => ({ easting,northing }))
    const touches = (a: XY[], b: XY[]) => {
      const pa = points(a), pb = points(b)
      return pa.some((p,i) => pb.some((q,j) => segmentsIntersect(p,pa[(i+1)%pa.length],q,pb[(j+1)%pb.length])))
    }
    const inside = (p: XY, ring: XY[]) => pointInPolygon({ easting:p[0],northing:p[1] },points(ring))
    const ring = (input: Position[]): XY[] => {
      if (input.length < 4 || input[0][0] !== input.at(-1)?.[0] || input[0][1] !== input.at(-1)?.[1]) throw new Error('A polygon ring is incomplete or not explicitly closed.')
      const projected = input.slice(0,-1).map(point)
      if (!isSimplePolygonRing(points(projected))) throw new Error('A polygon ring is degenerate or self-intersecting.')
      return projected
    }
    const polygon = (input: Position[][]): XY[][] => {
      if (!input.length) throw new Error('A polygon has no outer ring.')
      const rings = input.map(ring), [outer,...holes] = rings
      for (const [i,hole] of holes.entries()) {
        if (touches(outer,hole) || !inside(hole[0],outer)) throw new Error('A polygon hole crosses, touches or lies outside its outer ring.')
        for (const other of holes.slice(0,i)) {
          if (touches(hole,other) || inside(hole[0],other) || inside(other[0],hole)) throw new Error('Polygon holes overlap, touch or are nested.')
        }
      }
      const area = surveyArea(outer,authority.code) - holes.reduce((sum,hole) => sum+surveyArea(hole,authority.code),0)
      if (!(area > 0)) throw new Error('Polygon holes consume the outer area.')
      areaSqM += area
      polygonBoundaryLengthM += rings.reduce((sum,r) => sum+surveyPerimeter(r,authority.code),0)
      return rings
    }
    const line = (input: Position[]) => {
      if (input.length < 2) throw new Error('A line needs at least two coordinates.')
      const projected = input.map(point)
      for (let i = 1; i < projected.length; i++) lineLengthM += surveyDistance(...projected[i-1],...projected[i],authority.code)
    }
    const geometry = (g: Geometry | null, depth = 0): void => {
      if (!g || depth > 8) throw new Error('Drawing geometry is missing or nested too deeply.')
      switch (g.type) {
        case 'Point': point(g.coordinates); break
        case 'MultiPoint': g.coordinates.forEach(point); break
        case 'LineString': line(g.coordinates); break
        case 'MultiLineString': g.coordinates.forEach(line); break
        case 'Polygon': polygon(g.coordinates); break
        case 'MultiPolygon': {
          const members = g.coordinates.map(polygon)
          for (let i = 0; i < members.length; i++) for (const other of members.slice(0,i)) {
            if (members[i].some(a => other.some(b => touches(a,b)))
              || inside(members[i][0][0],other[0]) && !other.slice(1).some(h => inside(members[i][0][0],h))
              || inside(other[0][0],members[i][0]) && !members[i].slice(1).some(h => inside(other[0][0],h))) throw new Error('Members of one multipolygon overlap or touch.')
          }
          break
        }
        case 'GeometryCollection': g.geometries.forEach(child => geometry(child,depth+1)); break
      }
    }
    collection.features.forEach(feature => {
      if(feature.geometry===null&&'metarduDisplayGeometry' in feature) throw new Error('A retained display circle has no projected survey-circle definition. Numeric metrics are unavailable; its original display geometry is retained.')
      geometry(feature.geometry)
    })
    const totalLengthM = polygonBoundaryLengthM+lineLengthM
    if (![areaSqM,polygonBoundaryLengthM,lineLengthM,totalLengthM].every(Number.isFinite)) throw new Error('Map measurements are not finite.')
    return { status:'available',areaSqM,polygonBoundaryLengthM,lineLengthM,totalLengthM,crs:authority.code }
  } catch (error) {
    return { status:'unavailable',areaSqM:null,polygonBoundaryLengthM:null,lineLengthM:null,totalLengthM:null,crs,reason:error instanceof Error ? error.message : 'Map grid measurements could not be established.' }
  }
}
