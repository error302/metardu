import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { offlineObservationSource } from './observationReceipt'
export { offlineObservationSource } from './observationReceipt'

const reading=z.number().finite().nullish()
export const offlineObservationSchema=z.object({
  id:z.string().min(1).max(200),projectId:z.string().guid(),ownerId:z.string().guid().optional(),
  surveyType:z.enum(['traverse','leveling','topo','gnss','hydro','mining','unspecified']),
  observationType:z.enum(['gps','total_station','level','manual']).optional(),
  station:z.string().min(1).max(100),pointId:z.string().max(100).optional(),
  backsight:z.string().max(100).nullish(),foresight:z.string().max(100).nullish(),
  bearingDeg:reading,bearingMin:reading,bearingSec:reading,
  horizontalDistance:reading,horizontalAngle:reading,slopeDistance:reading,verticalAngle:reading,
  backsightReading:reading,foresightReading:reading,
  easting:reading,northing:reading,elevation:reading,
  latitude:z.number().finite().min(-90).max(90).nullish(),longitude:z.number().finite().min(-180).max(180).nullish(),
  instrumentHeight:reading,targetHeight:reading,fixQuality:z.number().int().min(0).max(32767).nullish(),
  satellites:z.number().int().nonnegative().nullish(),hdop:reading,
  horizontalCrs:z.string().max(64).nullish(),verticalDatum:z.string().max(120).nullish(),
  geographicCrs:z.string().max(64).nullish(),accuracy:reading,vdop:reading,pdop:reading,
  accuracySource:z.enum(['receiver','browser','unknown']).nullish(),solutionType:z.enum(['fixed','float','dgps','single']).nullish(),
  temperature:reading,pressure:reading,humidity:reading,weather:z.string().max(100).nullish(),
  instrumentName:z.string().max(120).nullish(),instrumentType:z.enum(['total_station','gnss_rover','gnss_static','level']).optional(),
  observationSource:z.enum(['gnss_receiver','browser_geolocation','total_station','manual']).optional(),
  notes:z.string().max(10000).nullish(),createdAt:z.string().datetime({offset:true}),
}).passthrough().superRefine((value,ctx)=>{
  for(const [a,b]of [['easting','northing'],['latitude','longitude']] as const){
    if((value[a]!=null)!==(value[b]!=null))ctx.addIssue({code:'custom',path:[a],message:`Supply both ${a} and ${b}, or leave both unknown.`})
  }
  if(Buffer.byteLength(JSON.stringify(value),'utf8')>65536)ctx.addIssue({code:'custom',message:'A single raw observation must be at most 64 KiB.'})
})
export type OfflineObservationCapture=z.infer<typeof offlineObservationSchema>

export const fieldObservationHash=(value:unknown)=>createHash('sha256').update(canonicalJson(JSON.parse(JSON.stringify(value)))).digest('hex')
export const offlineObservationInputHash=(input:Record<string,unknown>)=>fieldObservationHash(offlineObservationSource(input))
