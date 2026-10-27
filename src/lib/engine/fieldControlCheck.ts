import { z } from 'zod'
import { distanceBearing } from './distance'

const coordinate = z.number().finite().nullable().prefault(null)
const criterion = z.number().finite().min(0).max(1000).nullable().prefault(null)
export const fieldControlSchema = z.object({
  projectId:z.string().guid(), pointId:z.string().guid(), requestId:z.string().guid(),
  basisHash:z.string().regex(/^[a-f0-9]{64}$/),
  pointType:z.enum(['survey_point','beacon','boundary_monument']),
  observedAt:z.string().datetime({offset:true}).refine(value => {
    const date = value.slice(0,10), midnight = new Date(date+'T00:00:00Z')
    return Number.isFinite(midnight.getTime()) && midnight.toISOString().slice(0,10)===date
  }, 'Use a real calendar date'),
  condition:z.enum(['good','fair','poor','disturbed','destroyed','missing']),
  method:z.enum(['gnss_static','gnss_rtk','total_station','level','visual']),
  instrument:z.string().trim().min(1).max(200).nullable().prefault(null),
  evidenceReference:z.string().trim().min(5).max(2000),
  measuredEasting:coordinate, measuredNorthing:coordinate,
  measuredElevation:z.number().finite().min(-10000).max(100000).nullable().prefault(null),
  horizontalTolerance:criterion, verticalTolerance:criterion,
  toleranceReference:z.string().trim().min(5).max(2000).nullable().prefault(null),
  notes:z.string().trim().max(4000).prefault(''),
}).strict().superRefine((value,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:'custom',message})
  const horizontal=value.measuredEasting!==null&&value.measuredNorthing!==null
  if((value.measuredEasting===null)!==(value.measuredNorthing===null)) issue('Both horizontal coordinates are required')
  if(value.method==='visual') {
    if(horizontal||value.measuredElevation!==null||value.horizontalTolerance!==null||value.verticalTolerance!==null||value.toleranceReference!==null) issue('Visual inspection cannot declare a coordinate comparison')
  } else {
    if(!value.instrument) issue('Record the instrument used')
    if(!value.toleranceReference) issue('Record the source of the comparison criteria')
    if(value.method==='level') {
      if(horizontal||value.horizontalTolerance!==null||value.measuredElevation===null) issue('Levelling requires height and no invented horizontal observation')
    } else if(!horizontal) issue('This method requires both observed horizontal coordinates')
    if(horizontal!==(value.horizontalTolerance!==null)) issue('Horizontal observations require an explicit horizontal criterion')
    if((value.measuredElevation!==null)!==(value.verticalTolerance!==null)) issue('A measured height requires an explicit vertical criterion')
  }
})
export type FieldControlInput = z.infer<typeof fieldControlSchema>
export interface FieldControlBaseline { easting:number; northing:number; elevation:number|null }
/** Coordinate differences against a retained basis; no statistical stability or certification claim. */
export function assessFieldControl(base:FieldControlBaseline,input:FieldControlInput) {
  if(!Number.isFinite(base.easting)||!Number.isFinite(base.northing))throw new Error('The saved basis needs finite coordinates')
  let deltaE:number|null=null,deltaN:number|null=null,horizontalDisplacement:number|null=null,deltaH:number|null=null
  if(input.measuredEasting!==null&&input.measuredNorthing!==null){
    const result=distanceBearing(base,{easting:input.measuredEasting,northing:input.measuredNorthing})
    deltaE=result.deltaE;deltaN=result.deltaN;horizontalDisplacement=result.distance
  }
  if(input.measuredElevation!==null){
    if(base.elevation===null||!Number.isFinite(base.elevation))throw new Error('The saved basis has no finite height to compare')
    deltaH=input.measuredElevation-base.elevation
  }
  const horizontalPass=horizontalDisplacement===null||input.horizontalTolerance===null?null:horizontalDisplacement<=input.horizontalTolerance
  const verticalPass=deltaH===null||input.verticalTolerance===null?null:Math.abs(deltaH)<=input.verticalTolerance
  const status=['poor','disturbed','destroyed','missing'].includes(input.condition)?'unsuitable_condition':
    input.method==='visual'?'not_measured':horizontalPass===false||verticalPass===false?'exceeds_declared_tolerance':'within_declared_tolerance'
  return {deltaE,deltaN,deltaH,horizontalDisplacement,horizontalPass,verticalPass,status,comparisonSpace:'grid',certified:false,statisticalStabilityEstablished:false}
}
