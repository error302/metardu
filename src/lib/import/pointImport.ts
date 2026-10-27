import { z } from 'zod'
import { AppError } from '@/lib/api/errors'
import { importTotalStation } from './totalStation/unifiedImport'
import { resolveEpsg, transformPoint, validateCoordinateRange, validateCrsForProject } from '@/lib/spatial/projectCrs'
import type { StageReference } from '@/lib/workspaces/stageReference'

export const MAX_POINT_IMPORT_BYTES=2*1024*1024
export const MAX_POINT_IMPORT_ROWS=5000
export const pointImportOptionsSchema=z.object({
  format:z.enum(['gsi','jobxml','landxml','trimble_dc','carlson_rw5','topcon','sokkia','south','csv','unknown']).optional(),
  csvOrder:z.enum(['EN','NE']).optional(),
  gsiFootUnit:z.enum(['international','USSurveyFoot']).optional(),
}).strict()
export const pointImportSchema=z.object({
  requestId:z.string().guid(),fileName:z.string().min(1).max(255),
  sourceText:z.string().min(1).max(MAX_POINT_IMPORT_BYTES),fileSize:z.number().int().min(1).max(MAX_POINT_IMPORT_BYTES),
  sourceFileHash:z.string().regex(/^[a-f0-9]{64}$/),expectedReferenceHash:z.string().regex(/^[a-f0-9]{64}$/),
  selectedIndices:z.array(z.number().int().min(0).max(MAX_POINT_IMPORT_ROWS-1)).min(1).max(MAX_POINT_IMPORT_ROWS),
  options:pointImportOptionsSchema,
  sourceCrs:z.string().trim().min(1).max(100),
  coordinateUnit:z.enum(['file','metres','internationalFoot','USSurveyFoot','degrees']),
  heightUnit:z.enum(['file','metres','internationalFoot','USSurveyFoot']),
  confirmTransformation:z.boolean(),confirmVerticalDatum:z.boolean(),confirmWarnings:z.boolean(),
}).strict()
export type PointImportRequest=z.infer<typeof pointImportSchema>
export interface PreparedImportPoint {
  sourceIndex:number
  pointName:string
  easting:number
  northing:number
  elevation:number|null
  code:string|null
  raw:{easting:number;northing:number;elevation:number|null}
}
const reject=(message:string):never=>{throw new AppError(message,400,'POINT_IMPORT_INVALID')}
export const importUnitFactor=(unit:'metres'|'internationalFoot'|'USSurveyFoot')=>unit==='internationalFoot'?0.3048:unit==='USSurveyFoot'?1200/3937:1

/** Shared preview/commit authority. No guessed axis, height, CRS or datum. */
export function preparePointImport(request:PointImportRequest, reference:StageReference) {
  if (!reference.code || reference.source!=='declared') reject('Declare a valid projected project reference before importing points.')
  const projectCrs=reference.code as string
  const compatibility=validateCrsForProject(request.sourceCrs,projectCrs)
  if(compatibility.level==='error')reject(compatibility.message)
  const source=resolveEpsg(request.sourceCrs)
  if(source.code!==projectCrs&&!request.confirmTransformation)reject('Confirm the horizontal CRS transformation before importing.')
  const parsed=importTotalStation(request.sourceText,request.fileName,request.options)
  if(parsed.errors.length)reject(parsed.errors.join(' '))
  if(!parsed.rawPoints.length)reject('No coordinate points found. Raw angular observations require the fieldbook/control workflow; no origin was assumed.')
  if(parsed.rawPoints.length>MAX_POINT_IMPORT_ROWS)reject(`This import exceeds ${MAX_POINT_IMPORT_ROWS} records. Export explicitly selected survey areas; no rows were truncated.`)
  if(!request.selectedIndices.length)reject('Select at least one point.')
  if(new Set(request.selectedIndices).size!==request.selectedIndices.length)reject('Duplicate record selections are not allowed.')
  const warnings=[...parsed.warnings]
  const excludedCount=parsed.rawPoints.length-request.selectedIndices.length
  if(excludedCount>0)warnings.push(`${excludedCount} source coordinate record(s) were explicitly excluded; the complete source file is retained.`)
  if(parsed.normalizedMetres) {
    if(source.units!=='metres')reject('Encoded linear coordinates require a projected metre source CRS; they cannot be interpreted as geographic degrees.')
    if(request.coordinateUnit!=='file'||request.heightUnit!=='file')reject('Use the encoded file units for this format; coordinates are already normalized to metres.')
  } else {
    if(request.coordinateUnit==='file'||request.heightUnit==='file')reject('Declare source coordinate and height units for this file.')
    if((source.units==='degrees')!==(request.coordinateUnit==='degrees'))reject('Source units disagree with the declared CRS: geographic coordinates need decimal degrees; projected coordinates need linear units.')
  }
  const horizontalFactor=parsed.normalizedMetres||request.coordinateUnit==='degrees'?1:importUnitFactor(request.coordinateUnit as 'metres'|'internationalFoot'|'USSurveyFoot')
  const heightFactor=parsed.normalizedMetres?1:importUnitFactor(request.heightUnit as 'metres'|'internationalFoot'|'USSurveyFoot')
  const names=new Set<string>()
  const points:PreparedImportPoint[]=request.selectedIndices.map(sourceIndex=>{
    const row=parsed.rawPoints[sourceIndex]
    if(!row)reject('A selected source record no longer exists. Review the file again.')
    const pointName=row.id.trim()
    if(!pointName||pointName.length>100)reject(`Record ${sourceIndex+1}: a point name of 1–100 characters is required.`)
    if(names.has(pointName))reject(`Duplicate point name: ${pointName}. No points were imported.`)
    names.add(pointName)
    if(typeof row.easting!=='number'||!Number.isFinite(row.easting))reject(`${pointName}: missing or invalid easting.`)
    if(typeof row.northing!=='number'||!Number.isFinite(row.northing))reject(`${pointName}: missing or invalid northing.`)
    if(row.elevation!==undefined&&!Number.isFinite(row.elevation))reject(`${pointName}: invalid height; an empty height may remain unknown.`)
    if(row.code.length>20)reject(`${pointName}: point code exceeds the stored 20-character limit. Review the source; it was not truncated.`)
    const inputE=(row.easting as number)*horizontalFactor,inputN=(row.northing as number)*horizontalFactor
    const range=validateCoordinateRange(inputE,inputN,source.code)
    if(!range.valid)reject(`${pointName}: ${range.errors.join(' ')}`)
    warnings.push(...range.warnings.map(warning=>`${pointName}: ${warning}`))
    const [easting,northing]=source.code===projectCrs?[inputE,inputN]:transformPoint(inputE,inputN,source.code,projectCrs)
    const targetRange=validateCoordinateRange(easting,northing,projectCrs)
    if(!targetRange.valid)reject(`${pointName}: transformed coordinate is invalid. ${targetRange.errors.join(' ')}`)
    if(source.code!==projectCrs)warnings.push(...targetRange.warnings.map(warning=>`${pointName} (project CRS): ${warning}`))
    const elevation=row.elevation===undefined?null:row.elevation*heightFactor
    if(elevation!==null) {
      if(!reference.verticalDatum||!request.confirmVerticalDatum)reject('Declare the project vertical datum and confirm the source heights use that datum. No height transformation is assumed.')
      if(elevation < -10000||elevation>100000)reject(`${pointName}: height is outside the supported range.`)
    }
    return {sourceIndex,pointName,easting,northing,elevation,code:row.code||null,raw:{easting:row.easting as number,northing:row.northing as number,elevation:row.elevation??null}}
  })
  if(warnings.length&&!request.confirmWarnings)reject(`Review and acknowledge the import warnings/excluded records before committing. ${warnings.slice(0,3).join(' ')}`)
  return {points,excludedCount,warnings,sourceCrs:source.code,projectCrs,format:parsed.format,instrument:parsed.instrument,fieldVerified:false as const}
}
