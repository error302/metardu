import Papa from 'papaparse'
import type {RoadDesignData} from '@/types/engineering'
import {assertSurveyCrs} from '@/lib/spatial/projectCrs'
import {calculateRoadEarthworks} from './roadProjectOutputs'
import {resolveRoadDesignStations} from './roadVerticalAlignment'
import {roadGroundAssociationIssue} from './roadGroundAssociation'

export const ROAD_QUANTITY_ALGORITHM='road-average-end-area'
export const ROAD_QUANTITY_VERSION='1.0.0'
export interface QuantityReference {code:string|null;verticalDatum:string|null;distanceMode:'grid'|'ground'|null}

/** Shared input identity; no caches, inferred dimensions or calculated targets. */
export function roadQuantityInputs(road:RoadDesignData,reference:QuantityReference) {
  const associationIssue=roadGroundAssociationIssue(road)
  if(associationIssue)throw new RangeError(associationIssue)
  if(!reference.code)throw new RangeError('Declare a projected-metre project CRS.')
  const crs=assertSurveyCrs(reference.code)
  if(crs.units!=='metres')throw new RangeError('Quantity inputs require metre units.')
  if(road.coordinateSystem!==crs.code)throw new RangeError('The saved alignment CRS must match the current project reference.')
  if(!reference.verticalDatum?.trim())throw new RangeError('Declare the vertical datum shared by ground and design levels.')
  if(!reference.distanceMode)throw new RangeError('Declare the project grid/ground distance mode.')
  if(!road.crossSectionTemplate)throw new RangeError('Save a complete cross-section template.')
  if(road.stations.length>5000||road.stations.reduce((count,station)=>count+(station.groundProfile?.length??0),0)>250000)throw new RangeError('Use at most 5,000 sections and 250,000 measured profile points per quantity run.')
  const t=road.crossSectionTemplate
  const input={schemaVersion:1 as const,
    reference:{horizontalCrs:crs.code,verticalDatum:reference.verticalDatum.trim(),distanceMode:reference.distanceMode},
    road:{roadName:road.roadName,startChainage:road.startChainage,coordinateSystem:road.coordinateSystem,
      ips:road.ips.map(ip=>({id:ip.id,name:ip.name,easting:ip.easting,northing:ip.northing,radius:ip.radius,hasTransition:ip.hasTransition===true,
        transitionLengthIn:ip.transitionLengthIn??null,transitionLengthOut:ip.transitionLengthOut??null})),
      vips:road.vips.map(vip=>({id:vip.id,chainage:vip.chainage,reducedLevel:vip.reducedLevel,kValue:vip.kValue??null,curveLength:vip.curveLength??null,
        gradientIn:vip.gradientIn??null,gradientOut:vip.gradientOut??null})),
      crossSectionTemplate:{carriagewayWidth:t.carriagewayWidth,shoulderWidth:t.shoulderWidth,camber:t.camber,subgradeDepth:t.subgradeDepth,
        cutSlope:t.cutSlope,fillSlope:t.fillSlope,shoulderCrossfall:t.shoulderCrossfall??null},
      stations:road.stations.map(station=>({chainage:station.chainage,groundLevel:station.groundLevel,
        designLevel:station.designLevelSource==='vertical-alignment'?null:station.designLevel??null,designLevelSource:station.designLevelSource??'manual',
        groundProfile:station.groundProfile?.map(point=>({offset:point.offset,level:point.level}))??null}))}}
  const finite=(value:unknown):void=>{
    if(typeof value==='number'&&!Number.isFinite(value))throw new RangeError('Supply complete finite source measurements.')
    if(Array.isArray(value))value.forEach(finite)
    else if(value&&typeof value==='object')Object.values(value).forEach(finite)
  }
  finite(input)
  if(JSON.stringify(input).length>8_000_000)throw new RangeError('Use a source snapshot smaller than 8 million characters per quantity run.')
  return input
}
export type RoadQuantityInputs=ReturnType<typeof roadQuantityInputs>

export function calculateRoadQuantityRun(road:RoadDesignData,reference:QuantityReference) {
  const inputs=roadQuantityInputs(road,reference)
  const resolved=resolveRoadDesignStations(road)
  if(resolved.issues.length)throw new RangeError(resolved.issues.join(' '))
  const quantity=calculateRoadEarthworks(resolved.stations,road.crossSectionTemplate)
  if(quantity.issues.length)throw new RangeError(quantity.issues.join(' '))
  if(quantity.totalCut===null||quantity.totalFill===null||!quantity.rows.length)throw new RangeError('Complete measured sections are required for quantities.')
  return {schemaVersion:1 as const,algorithmId:ROAD_QUANTITY_ALGORITHM,algorithmVersion:ROAD_QUANTITY_VERSION,status:'DRAFT' as const,
    basis:'geometric volumes; material factors and curvature corrections not applied',inputs,
    result:{rows:quantity.rows,totalCut:quantity.totalCut,totalFill:quantity.totalFill}}
}
export type RoadQuantityCalculation=ReturnType<typeof calculateRoadQuantityRun>
export interface RoadQuantityRecord {
  id:string;revision:string;status:string;created_at:string;created_by:string|null
  quantity:RoadQuantityCalculation&{inputHash:string;outputHash:string;clientRunId:string}
}

/** Machine-readable columns retain the archived identity and full numeric precision. */
export function roadQuantityCsv(record:RoadQuantityRecord) {
  const run=record.quantity
  return Papa.unparse(run.result.rows.map(row=>({
    Run_ID:record.id,Revision:record.revision,Record_status:record.status,Calculation_status:run.status,
    Recorded_at:record.created_at,Recorded_by:record.created_by??'',Algorithm:run.algorithmId,Algorithm_version:run.algorithmVersion,
    Input_SHA256:run.inputHash,Output_SHA256:run.outputHash,Horizontal_CRS:run.inputs.reference.horizontalCrs,
    Vertical_datum:run.inputs.reference.verticalDatum,Distance_mode:run.inputs.reference.distanceMode,Quantity_basis:run.basis,
    Method:row.method==='origin'?'origin':'average-end-area',Chainage_m:row.chainage,Ground_RL_m:row.groundLevel,
    Design_surface_RL_m:row.designLevel,Formation_RL_m:row.formationLevel,Cut_area_m2:row.cutArea,Fill_area_m2:row.fillArea,
    Cut_increment_m3:row.cutVolume,Fill_increment_m3:row.fillVolume,Cumulative_cut_m3:row.cumulativeCut,Cumulative_fill_m3:row.cumulativeFill,
    Left_daylight_offset_m:row.leftDaylightOffset,Right_daylight_offset_m:row.rightDaylightOffset,
  })),{escapeFormulae:true})
}
