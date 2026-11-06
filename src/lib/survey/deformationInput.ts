import {z} from 'zod'
import type {EpochSet} from './deformationMonitoring'

const sigma=z.number().finite().positive()
const monument=z.object({
  // Instrument station numbers may be numeric; normalize only lossless integer identifiers.
  monumentId:z.preprocess(value=>typeof value==='number'&&Number.isSafeInteger(value)?String(value):value,z.string().trim().min(1).max(150)),
  latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),
  height:z.number().finite(),epoch:z.number().finite(),
  frame:z.enum(['ITRF2014','ITRF2008','ITRF2020','WGS84_G1762','WGS84_G1674','WGS84_G1150']),
  sigmaE:sigma.optional(),sigmaN:sigma.optional(),sigmaH:sigma.optional(),sigmaEN:z.number().finite().optional(),
}).strict().superRefine((point,ctx)=>{
  for(const key of ['sigmaE','sigmaN','sigmaH'] as const){
    const value=point[key]
    if(value!==undefined&&(!Number.isFinite(value**2)||value**2===0))ctx.addIssue({code:'custom',path:[key],message:'Monitoring standard deviation must produce a finite positive variance.'})
  }
  if(point.sigmaEN!==undefined&&(point.sigmaE===undefined||point.sigmaN===undefined||Math.abs(point.sigmaEN)>=point.sigmaE*point.sigmaN)){
    ctx.addIssue({code:'custom',path:['sigmaEN'],message:'Monitoring covariance must define a positive-definite horizontal uncertainty matrix.'})
  }
})
export const monitoringEpochSchema=z.object({label:z.string().trim().min(1).max(200),epoch:z.number().finite(),monuments:z.array(monument).max(10000)}).strict().superRefine((epoch,ctx)=>{
  const seen=new Set<string>()
  epoch.monuments.forEach((point,index)=>{
    if(seen.has(point.monumentId))ctx.addIssue({code:'custom',path:['monuments',index,'monumentId'],message:'Each monitoring monument must occur only once in an epoch.'})
    seen.add(point.monumentId)
  })
})

export function readMonitoringEpoch(value:unknown):EpochSet {
  const parsed=monitoringEpochSchema.safeParse(value)
  if(!parsed.success)throw new Error('Invalid monitoring coordinates, frame, epoch or uncertainty: '+(parsed.error.issues[0]?.message??'Review the input.'))
  return parsed.data
}

/** HTTP requests need declared project criteria; library convenience defaults are not an approved monitoring plan. */
export const deformationComparisonSchema=z.object({baseline:monitoringEpochSchema,current:monitoringEpochSchema,
  tolerance:z.object({horizontal:z.number().finite().positive(),vertical:z.number().finite().positive()}).strict(),
  confidenceLevel:z.union([z.literal(0.95),z.literal(0.99)]).prefault(0.95),
}).strict().superRefine((comparison,ctx)=>{
  const baselineFrames=new Map(comparison.baseline.monuments.map(point=>[point.monumentId,point.frame]))
  comparison.current.monuments.forEach((point,index)=>{
    const frame=baselineFrames.get(point.monumentId)
    if(frame&&frame!==point.frame)ctx.addIssue({code:'custom',path:['current','monuments',index,'frame'],message:'Monitoring comparison requires aligned reference frames.'})
  })
})
