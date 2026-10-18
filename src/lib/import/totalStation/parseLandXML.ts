import { XMLParser } from 'fast-xml-parser'
import { coordinateNumber } from './coordinateNumber'

export interface LandXmlPoint {
  pointId: string
  northing?: number
  easting?: number
  elevation?: number
  code?: string
  description?: string
}
export interface LandXmlParsed {
  records: LandXmlPoint[]
  projectUnits: { linear: 'meter' | 'foot' | 'internationalFoot' | 'unknown'; angular: 'decimal degrees' | 'radians' | 'dms' | 'unknown' }
  normalizedMetres: boolean
  warnings: string[]
  errors: string[]
  pointCount: number
}
/** Exact factors: NIST international foot and legacy US survey foot. */
function unitFactor(unit: string): number | undefined {
  if (['meter','metre','meters','metres'].includes(unit)) return 1
  if (['foot','feet','internationalFoot'].includes(unit)) return 0.3048
  if (unit === 'USSurveyFoot') return 1200 / 3937
  return undefined
}
export function parseLandXML(content: string): LandXmlParsed {
  const records: LandXmlPoint[] = [], warnings: string[] = [], errors: string[] = []
  const result: LandXmlParsed = { records, warnings, errors, pointCount:0, normalizedMetres:false, projectUnits:{linear:'unknown',angular:'unknown'} }
  try {
    if (/<!DOCTYPE|<!ENTITY/i.test(content)) throw new Error('External XML declarations are not allowed')
    const doc: unknown = new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,processEntities:true}).parse(content,true)
    let linear = '', elevationUnit = '', unitDeclarations=0
    const candidates: Record<string,unknown>[] = []
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) { node.forEach(visit); return }
      for (const [key,value] of Object.entries(node as Record<string,unknown>)) {
        if (key === 'Metric' || key === 'Imperial') {
          unitDeclarations++
          if(unitDeclarations>1)errors.push('Ambiguous multiple LandXML unit declarations. Re-export with one explicit unit system.')
          const units=value as Record<string,unknown>
          linear=String(units['@_linearUnit'] ?? '')
          elevationUnit=String(units['@_elevationUnit'] ?? '')
        }
        if (key === 'CgPoint') for (const item of Array.isArray(value)?value:[value]) {
          if (item && typeof item==='object') candidates.push(item as Record<string,unknown>)
          else candidates.push({'#text':String(item??'')})
        }
        visit(value)
      }
    }
    visit(doc)
    const scale=unitFactor(linear)
    if (linear && scale===undefined) errors.push(`Unsupported LandXML linear unit: ${linear}`)
    if (!linear) warnings.push('LandXML units are not declared. Confirm the source coordinate units before import.')
    const zScale=elevationUnit?unitFactor(elevationUnit):scale
    if(elevationUnit&&!linear)errors.push('LandXML declares height units without horizontal units. Re-export with one complete unit declaration before importing.')
    if (elevationUnit && zScale===undefined) errors.push(`Unsupported LandXML elevation unit: ${elevationUnit}`)
    result.normalizedMetres=scale!==undefined
    result.projectUnits.linear=scale===1?'meter':linear==='USSurveyFoot'?'foot':scale?'internationalFoot':'unknown'
    for (const point of candidates) {
      const tokens=String(point['#text']??point['@_p']??'').trim().split(/\s+/)
      const height=coordinateNumber(tokens[2])
      if (height!==undefined && scale!==undefined && scale!==1 && !elevationUnit) errors.push('LandXML elevation units must be declared for a feet-based file with heights; re-export with elevationUnit.')
      const convert=(value:number|undefined,factor:number|undefined)=>value===undefined?undefined:value*(factor??1)
      records.push({pointId:String(point['@_name']??point['@_pntNum']??'').trim(),northing:convert(coordinateNumber(tokens[0]),scale),
        easting:convert(coordinateNumber(tokens[1]),scale),elevation:convert(height,zScale),code:String(point['@_code']??point['@_desc']??'') || undefined})
    }
    if (!records.length) warnings.push('No CgPoint coordinate records found in LandXML file.')
  } catch { errors.push('Invalid LandXML document; no points were accepted.'); records.length=0 }
  result.pointCount=records.length
  return result
}
