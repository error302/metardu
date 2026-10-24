import Feature from 'ol/Feature'
import GeoJSON from 'ol/format/GeoJSON'
import Circle from 'ol/geom/Circle'
import type Geometry from 'ol/geom/Geometry'
import type { Feature as GeoJsonFeature,Geometry as JsonGeometry } from 'geojson'
type JsonFeature = GeoJsonFeature<JsonGeometry|null>
import { displayCircleSchema,mapFeatureCollectionSchema } from '@/lib/validation/mapDrawing'
import type { MapFeatureCollection } from './wire'

interface SourceRecord { original: JsonFeature; geometryRevision: number; featureRevision: number; order: number }
const sourceRecords = new WeakMap<Feature,SourceRecord>()
let internalId = 0
let retainedOrder = 0
const clone = <T>(value:T):T => JSON.parse(JSON.stringify(value)) as T
const safeProperties = (value:Record<string,unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__','constructor','prototype'].includes(key)))

/** Internal OL IDs must be unique even when retained GeoJSON IDs are missing or duplicated. */
export function decodeMapDrawing(collection: MapFeatureCollection): Feature<Geometry>[] {
  const format = new GeoJSON()
  return collection.features.map(original => {
    const circle=displayCircleSchema.safeParse(original.metarduDisplayGeometry)
    const geometry = original.geometry===null ? (circle.success ? new Circle(circle.data.center,circle.data.radius) : null)
      : format.readGeometry(original.geometry,{ dataProjection:'EPSG:4326',featureProjection:'EPSG:3857' })
    if (!geometry || !geometry.getExtent().every(Number.isFinite)) throw new Error('A stored feature cannot be displayed. Download the retained original drawing before review.')
    const feature = new Feature<Geometry>()
    let geometryName = '__metardu_display_geometry'
    while (original.properties && geometryName in original.properties) geometryName += '_'
    feature.setGeometryName(geometryName)
    if (original.properties) feature.setProperties(safeProperties(clone(original.properties)))
    feature.setGeometry(geometry)
    feature.setId(`metardu-display-${++internalId}`)
    sourceRecords.set(feature,{ original:clone(original) as JsonFeature,geometryRevision:geometry.getRevision(),featureRevision:feature.getRevision(),order:++retainedOrder })
    return feature
  })
}

/** Preserve exact original coordinates until geometry actually changes. */
export function encodeMapDrawing(features: Feature[]): MapFeatureCollection {
  const format = new GeoJSON()
  // VectorSource's spatial index returns a different order for larger drawings.
  // Keep original collection order; newly drawn features append in capture order.
  const ordered = features.slice().sort((a,b)=>(sourceRecords.get(a)?.order??Infinity)-(sourceRecords.get(b)?.order??Infinity))
  const output = ordered.map(feature => {
    const geometry = feature.getGeometry()
    if (!geometry) throw new Error('A drawing feature has no geometry. The local draft is retained.')
    const source = sourceRecords.get(feature)
    if (source && source.featureRevision === feature.getRevision() && source.geometryRevision === geometry.getRevision()) return clone(source.original)
    const nativeProperties={...feature.getProperties()};delete nativeProperties[feature.getGeometryName()]
    const encoded:JsonFeature = geometry.getType()==='Circle'
      ? {type:'Feature',geometry:null,properties:nativeProperties,metarduDisplayGeometry:{type:'Circle',coordinateCrs:'EPSG:3857',center:(geometry as Circle).getCenter(),radius:(geometry as Circle).getRadius()}} as JsonFeature
      : format.writeFeatureObject(feature,{ featureProjection:'EPSG:3857',dataProjection:'EPSG:4326' }) as JsonFeature
    if (source) {
      const sameGeometry = source.geometryRevision === geometry.getRevision()
      const result = { ...clone(source.original),...encoded }
      if (source.original.id === undefined) delete result.id
      else result.id = source.original.id
      if (sameGeometry) result.geometry = clone(source.original.geometry)
      else delete result.bbox
      // Protected JavaScript property names are retained as data, outside OL's property bag.
      if (source.original.properties) result.properties = { ...source.original.properties,...encoded.properties }
      return result
    }
    const id = feature.getId() ?? crypto.randomUUID()
    encoded.id = id
    feature.setId(id)
    sourceRecords.set(feature,{ original:clone(encoded),geometryRevision:geometry.getRevision(),featureRevision:feature.getRevision(),order:++retainedOrder })
    return encoded
  })
  const parsed = mapFeatureCollectionSchema.safeParse({ type:'FeatureCollection',features:output })
  if (!parsed.success) throw new Error('The drawing contains an unsupported or invalid feature. No feature was dropped; retain the draft for review.')
  return parsed.data
}

/** Undo/redo clones all OL geometry types, IDs and saved-source provenance before replacing a source. */
export function cloneMapDrawingFeature(feature: Feature): Feature {
  const copied = new Feature()
  copied.setGeometryName(feature.getGeometryName())
  const geometry = feature.getGeometry()
  if (geometry) copied.setGeometry(geometry.clone())
  copied.setStyle(feature.getStyle())
  copied.setId(feature.getId())
  const properties = { ...feature.getProperties() }
  delete properties[feature.getGeometryName()]
  for (const [key,value] of Object.entries(properties)) {
    try { copied.set(key,structuredClone(value)) }
    catch { try { copied.set(key,clone(value)) } catch { copied.set(key,value) } }
  }
  const record = sourceRecords.get(feature)
  const copiedGeometry=copied.getGeometry()
  if (record) sourceRecords.set(copied,{
    order:record.order,
    original:clone(record.original),
    featureRevision:record.featureRevision === feature.getRevision() ? copied.getRevision() : -1,
    geometryRevision:record.geometryRevision === feature.getGeometry()?.getRevision()&&copiedGeometry ? copiedGeometry.getRevision() : -1,
  })
  return copied
}
