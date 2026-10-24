import type {Geometry,Position} from 'geojson'
import type {MapFeatureCollection} from '@/lib/mapDrawing/wire'
import {assertProjectedCrs,transformPoint,validateCoordinateRange} from '@/lib/spatial/projectCrs'
import {mapFeatureCollectionSchema} from '@/lib/validation/mapDrawing'
import {canonicalJson} from '@/lib/provenance/canonicalJson'
import type {LandXMLPoint,LandXMLPlanFeature} from './generateLandXML'

/** Complete unverified drawing handoff. Rings remain plan features, not legal parcels. */
export function mapDrawingToLandXML(collection:MapFeatureCollection,grid:string):{points:LandXMLPoint[];planFeatures:LandXMLPlanFeature[]} {
  const authority=assertProjectedCrs(grid),validated=mapFeatureCollectionSchema.parse(collection)
  const points:LandXMLPoint[]=[],planFeatures:LandXMLPlanFeature[]=[]
  validated.features.forEach((feature,index)=>{
    const prefix=`F${index+1}`,source={sourceFeatureId:canonicalJson(feature.id??null),
      sourceProperties:canonicalJson(feature.properties),sourceFeatureIndex:String(index),evidenceStatus:'map_drawing_unverified',
      sourceCoordinateCrs:'EPSG:4326',sourceFeature:canonicalJson(feature)}
    let sourceRecorded=false
    const point=(position:Position,path:string):string=>{
      const [easting,northing]=transformPoint(position[0],position[1],'EPSG:4326',authority.code)
      const range=validateCoordinateRange(easting,northing,authority.code)
      if(!Number.isFinite(easting)||!Number.isFinite(northing)||!range.valid)throw new Error(`Feature ${index+1} cannot be represented in ${grid}. Export cancelled; drawing retained.`)
      const name=`${prefix}-${path}-${points.length+1}`
      points.push({name,easting,northing,elevation:position.length===3?position[2]:null,is_control:false,
        metadata:{...(!sourceRecorded?source:{sourceFeatureIndex:String(index)}),geometryPath:path,sourcePosition:canonicalJson(position),heightStatus:position.length>=3?'source_ordinate_unverified':'unknown'}})
      sourceRecorded=true
      return name
    }
    const line=(positions:Position[],path:string,role:string)=>{
      const pointRefs=positions.map((position,vertex)=>point(position,`${path}-V${vertex+1}`))
      planFeatures.push({name:`${prefix}-${path}`,pointRefs,metadata:{sourceFeatureIndex:String(index),geometryPath:path,geometryRole:role,evidenceStatus:'map_drawing_unverified'}})
    }
    const polygon=(rings:Position[][],path:string)=>rings.forEach((ring,index)=>line(ring,`${path}-R${index+1}`,index===0?'polygon-outer':'polygon-hole'))
    const visit=(geometry:Geometry|null,path:string):void=>{
      if(!geometry)throw new Error(`Feature ${index+1} is a retained display circle. LandXML export requires a supported survey geometry; no feature was dropped.`)
      switch(geometry.type){
        case 'Point':point(geometry.coordinates,path);break
        case 'MultiPoint':geometry.coordinates.forEach((p,i)=>point(p,`${path}-P${i+1}`));break
        case 'LineString':line(geometry.coordinates,path,'line');break
        case 'MultiLineString':geometry.coordinates.forEach((p,i)=>line(p,`${path}-L${i+1}`,'line'));break
        case 'Polygon':polygon(geometry.coordinates,path);break
        case 'MultiPolygon':geometry.coordinates.forEach((p,i)=>polygon(p,`${path}-P${i+1}`));break
        case 'GeometryCollection':geometry.geometries.forEach((g,i)=>visit(g,`${path}-G${i+1}`));break
      }
    }
    visit(feature.geometry,'geometry')
  })
  if(!points.length)throw new Error('No drawing coordinates are available for LandXML export.')
  return {points,planFeatures}
}
