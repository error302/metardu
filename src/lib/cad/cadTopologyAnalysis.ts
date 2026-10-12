import polygonize from '@turf/polygonize'
import type { Feature, FeatureCollection, LineString } from 'geojson'
import { coordinateArea } from '@/lib/engine/area'
import { deriveBoundaryMeasurements } from '@/lib/cadGeometry'
import { isSimplePolygonRing, segmentsIntersect, polygonInteriorPoint, strictPointInRing } from '@/lib/spatial/simplePolygon'
import { hasCadReferenceFrame } from './cadReferenceFrame'
import { cadCanvasToProject } from './projectCadDocument'
import type { CadTopologyInput, CadTopologyResult } from './cadTopologyProtocol'

type Point = { easting: number; northing: number }
const coordinateKey = (point: Point) => `${point.easting},${point.northing}`
const edgeKey = (a: string, b: string) => JSON.stringify(a < b ? [a,b] : [b,a])

/** Polygonize explicitly noded planar linework; never infer property boundaries from point order. */
export function analyseCadTopology(input: CadTopologyInput): CadTopologyResult {
  const result: CadTopologyResult = { status: 'empty', basis: 'unscaled-drawing', faces: [], networkLengthM:null, totalAreaM2:null, totalAreaHa:null, totalAreaAcres:null, unenclosedEdgeCount:0, issues:[], measurements:[] }
  const invalid = (message: string) => { result.status = 'invalid'; result.faces=[]; result.totalAreaM2=null; result.totalAreaHa=null; result.totalAreaAcres=null; result.issues.push(message); return result }
  if (![input.width,input.height].every(n => Number.isFinite(n) && n > 0 && n <= 20000) || input.beacons.length > 10000 || input.boundaries.length > 20000) return invalid('The drawing exceeds supported geometry limits.')
  if (input.metersPerPixel !== undefined && (!Number.isFinite(input.metersPerPixel) || input.metersPerPixel <= 0 || input.metersPerPixel > 100000)) return invalid('Drawing scale must be finite, positive and within supported limits.')
  const metric = input.metersPerPixel !== undefined
  const referenced = hasCadReferenceFrame(input)
  if (input.coordinateReferenceSystem || input.originEasting !== undefined || input.originNorthing !== undefined) {
    if (!referenced) { result.basis = 'invalid-reference'; return invalid('Apply a complete, supported Coordinate reference before calculating grid measurements.') }
    result.basis = 'project-grid'
  } else result.basis = metric ? 'scaled-drawing' : 'unscaled-drawing'
  const used = new Set(input.boundaries.flatMap(edge => [edge.fromId,edge.toId]))
  const points = new Map<string,Point>()
  const allIds = new Set<string>()
  const locations = new Map<string,string>()
  for (const beacon of input.beacons) {
    if (!beacon.id || allIds.has(beacon.id)) return invalid('Point identities must be unique before topology checking.')
    allIds.add(beacon.id)
    if (!used.has(beacon.id)) continue
    if (![beacon.x,beacon.y].every(Number.isFinite)) return invalid(`Point ${beacon.label} has invalid drawing coordinates.`)
    let point: Point
    if (referenced) {
      if (beacon.easting === undefined || beacon.northing === undefined || ![beacon.easting,beacon.northing].every(Number.isFinite)) { result.basis='invalid-reference'; return invalid(`Point ${beacon.label} needs complete grid coordinates.`) }
      const grid = cadCanvasToProject(beacon.x,beacon.y,input.originEasting,input.originNorthing,input.height,input.metersPerPixel)
      const tolerance = Math.max(1e-6,Math.abs(beacon.easting)*Number.EPSILON*16,Math.abs(beacon.northing)*Number.EPSILON*16)
      if (Math.hypot(grid.easting-beacon.easting,grid.northing-beacon.northing)>tolerance) { result.basis='invalid-reference'; return invalid('Apply Coordinate reference settings to align the drawing with its supplied controls.') }
      point = {easting:beacon.easting,northing:beacon.northing}
    } else point = {easting:beacon.x*(input.metersPerPixel??1),northing:-beacon.y*(input.metersPerPixel??1)}
    if (![point.easting,point.northing].every(Number.isFinite)) return invalid('Point coordinates exceed finite measurement limits.')
    const key = coordinateKey(point)
    if (locations.has(key)) return invalid('Coincident boundary points have different identities. Merge their junction explicitly before checking topology.')
    locations.set(key,beacon.id); points.set(beacon.id,point)
  }
  const pairs = new Set<string>(); const ids = new Set<string>()
  const edges: Array<{id:string;a:string;b:string;from:Point;to:Point;minX:number;maxX:number;minY:number;maxY:number}> = []
  for (const boundary of input.boundaries) {
    const from = points.get(boundary.fromId); const to = points.get(boundary.toId)
    if (!from || !to || boundary.fromId === boundary.toId) return invalid('An edge has a missing endpoint or connects a point to itself.')
    const key = edgeKey(boundary.fromId,boundary.toId)
    if (!boundary.id || ids.has(boundary.id) || pairs.has(key)) return invalid('Duplicate boundary identities or duplicate edges must be resolved before topology checking.')
    ids.add(boundary.id); pairs.add(key)
    edges.push({id:boundary.id,a:boundary.fromId,b:boundary.toId,from,to,minX:Math.min(from.easting,to.easting),maxX:Math.max(from.easting,to.easting),minY:Math.min(from.northing,to.northing),maxY:Math.max(from.northing,to.northing)})
  }
  if (!edges.length) return result
  const measurements = deriveBoundaryMeasurements(Array.from(points,([id,p])=>({id,...p})),input.boundaries)
  result.measurements = measurements.map(edge=>({id:edge.id,bearing:edge.bearing,bearingDeg:edge.bearingDeg,distance:metric?edge.distanceM.toFixed(3):'Uncalibrated',distanceM:metric?edge.distanceM:undefined}))
  if (metric) result.networkLengthM = measurements.reduce((sum,edge)=>sum+edge.distanceM,0)
  // Bounding-box sweep rejects crossings/T-junctions without requiring a geographic transform.
  let active: typeof edges = []
  for (const edge of [...edges].sort((a,b)=>a.minX-b.minX)) {
    active = active.filter(other=>other.maxX+1e-9>=edge.minX)
    for (const other of active) {
      if (other.maxY+1e-9<edge.minY || edge.maxY+1e-9<other.minY) continue
      const shared = edge.a === other.a || edge.a === other.b ? edge.a : edge.b === other.a || edge.b === other.b ? edge.b : undefined
      if (shared) {
        const common = points.get(shared)
        if (!common) return invalid('A junction point is missing.')
        const p = edge.a===shared?edge.to:edge.from; const q=other.a===shared?other.to:other.from
        const cross=(p.easting-common.easting)*(q.northing-common.northing)-(p.northing-common.northing)*(q.easting-common.easting)
        const dot=(p.easting-common.easting)*(q.easting-common.easting)+(p.northing-common.northing)*(q.northing-common.northing)
        if (Math.abs(cross)<=1e-9 && dot>0) return invalid('Overlapping edges at a junction must be split into distinct shared segments.')
      } else if (segmentsIntersect(edge.from,edge.to,other.from,other.to)) return invalid('Edges intersect without an explicit shared junction. Split the crossing or T-junction before measuring closed faces.')
    }
    active.push(edge)
  }
  const features: Array<Feature<LineString>> = edges.map(edge=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[edge.from.easting,edge.from.northing],[edge.to.easting,edge.to.northing]]}}))
  const collection: FeatureCollection<LineString> = {type:'FeatureCollection',features}
  const polygons = polygonize(collection)
  const enclosed = new Set<string>()
  let totalArea = 0; let totalHa=0; let totalAcres=0
  // Polygonize may return a contained ring twice, in opposite directions.
  // Immediate containment partitions the bounded faces without duplicate area.
  const uniqueRings = new Map<string,Point[]>()
  for (const feature of polygons.features) {
    for (const coordinates of feature.geometry.coordinates) {
      const ring=coordinates.slice(0,-1).map(([easting,northing])=>({easting,northing}))
      if (!isSimplePolygonRing(ring)) return invalid('A bounded face has invalid or degenerate ring geometry.')
      const key=JSON.stringify(ring.map((p,i)=>edgeKey(coordinateKey(p),coordinateKey(ring[(i+1)%ring.length]))).sort())
      uniqueRings.set(key,ring)
    }
  }
  const ringList=Array.from(uniqueRings.values())
  const ringAreas=ringList.map(ring=>coordinateArea(ring).areaSqm)
  const parents=ringList.map((ring,index)=>{
    const interior=polygonInteriorPoint(ring)
    let parent=-1
    if (!interior) return parent
    ringList.forEach((candidate,other)=>{
      if (other!==index && ringAreas[other]>ringAreas[index] && (parent<0 || ringAreas[other]<ringAreas[parent]) && strictPointInRing(interior,candidate)) parent=other
    })
    return parent
  })
  for (const [index,outerRing] of ringList.entries()) {
    const rings=[outerRing,...ringList.filter((_ring,child)=>parents[child]===index)]
    const outer = coordinateArea(rings[0]); const holes = rings.slice(1).map(coordinateArea)
    const area = outer.areaSqm-holes.reduce((sum,hole)=>sum+hole.areaSqm,0)
    const ha=outer.areaHa-holes.reduce((sum,hole)=>sum+hole.areaHa,0)
    const acres=outer.areaAcres-holes.reduce((sum,hole)=>sum+hole.areaAcres,0)
    const perimeter = outer.perimeter+holes.reduce((sum,hole)=>sum+hole.perimeter,0)
    if (!(area>0) || ![area,perimeter].every(Number.isFinite)) return invalid('A bounded face has no finite positive area.')
    result.faces.push({areaM2:metric?area:null,perimeterM:metric?perimeter:null,rings})
    totalArea+=area;totalHa+=ha;totalAcres+=acres
    for (const ring of rings) for (let i=0;i<ring.length;i++) {
      const a=locations.get(coordinateKey(ring[i]));const b=locations.get(coordinateKey(ring[(i+1)%ring.length]))
      if (!a || !b) return invalid('The polygonizer returned a junction absent from the source linework.')
      enclosed.add(edgeKey(a,b))
    }
  }
  result.unenclosedEdgeCount = edges.filter(edge=>!enclosed.has(edgeKey(edge.a,edge.b))).length
  result.status = result.faces.length ? result.unenclosedEdgeCount ? 'mixed' : 'closed' : 'open'
  if (metric && result.faces.length) { result.totalAreaM2=totalArea;result.totalAreaHa=totalHa;result.totalAreaAcres=totalAcres }
  if (result.unenclosedEdgeCount) result.issues.push(`${result.unenclosedEdgeCount} edge${result.unenclosedEdgeCount===1?' belongs':'s belong'} to open or cut linework, outside the closed-face areas.`)
  return result
}
