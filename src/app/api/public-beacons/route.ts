import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { publicControlSchema } from '@/lib/survey/publicControl'
import { assertProjectedCrs, formatBearingDms, surveyBearing, transformPoint, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store'}
const finite=z.string().trim().min(1).transform(Number).refine(Number.isFinite)
const searchSchema=z.object({q:z.string().max(100).optional(),type:z.enum(['trig','control','boundary','benchmark','gnss','tidal','other']).optional(),
 crs:z.string().trim().min(1).max(64).optional(),easting:finite.optional(),northing:finite.optional(),radius:finite.pipe(z.number().min(0).max(100000)).prefault('10000'),
 limit:finite.pipe(z.number().int().min(1).max(200)).prefault('100'),mine:z.enum(['true']).optional()})
export const GET=apiHandler({auth:true,rateLimit:{max:120,windowMs:60000}},async(req,ctx)=>{
 const parsed=searchSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
 if(!parsed.success)return NextResponse.json({error:'Invalid reference catalogue search'},{status:400})
 const p=parsed.data, near=p.easting!==undefined||p.northing!==undefined
 if(near&&(p.easting===undefined||p.northing===undefined||!p.crs))return NextResponse.json({error:'Nearby references require easting, northing and their explicit grid'},{status:400})
 const values:unknown[]=[],bind=(value:unknown)=>{values.push(value);return `$${values.length}`}
 const clauses=p.mine?[`submitted_by=${bind(ctx.userId)}`]:["status='verified'",'horizontal_crs IS NOT NULL','source_reference IS NOT NULL',"EXISTS(SELECT 1 FROM public_beacon_reviews r WHERE r.beacon_id=b.id AND r.decision='verified' AND r.reviewer_id=b.verified_by AND r.created_at=b.verified_at)"]
 if(p.q)clauses.push(`name ILIKE ${bind(`%${p.q}%`)}`)
 if(p.type)clauses.push(`beacon_type=${bind(p.type)}`)
 let distance='',order='name,id'
 if(near){
   let code:string
   try {code=assertProjectedCrs(p.crs as string).code;const range=validateCoordinateRange(p.easting as number,p.northing as number,code);if(!range.valid)throw new Error(range.errors.join('; '))}
   catch{return NextResponse.json({error:'Select a valid projected survey grid and coordinates'},{status:400})}
   clauses.push(`horizontal_crs=${bind(code)}`)
   const ep=bind(p.easting),np=bind(p.northing),rp=bind(p.radius)
   clauses.push(`easting BETWEEN ${ep}::float8-${rp}::float8 AND ${ep}::float8+${rp}::float8`,`northing BETWEEN ${np}::float8-${rp}::float8 AND ${np}::float8+${rp}::float8`,
    `POWER(easting-${ep}::float8,2)+POWER(northing-${np}::float8,2)<=POWER(${rp}::float8,2)`)
   distance=`,SQRT(POWER(easting-${ep}::float8,2)+POWER(northing-${np}::float8,2)) AS distance_m`;order='distance_m,id'
 }
 const rows=(await db.query<Record<string, unknown>&{easting:number;northing:number;horizontal_crs:string;distance_m?:number}>(`SELECT id,name,beacon_type,easting,northing,elevation,horizontal_crs,vertical_datum,source_reference,authority,country,description,status,verified_at${distance} FROM public_beacons b WHERE ${clauses.join(' AND ')} ORDER BY ${order} LIMIT ${bind(p.limit)}`,values)).rows
 const beacons=rows.map(row=>{
  const bearing=near&&row.distance_m!=null&&row.distance_m>0?surveyBearing(p.easting as number,p.northing as number,row.easting,row.northing,row.horizontal_crs):null
  return {...row,bearing_deg:bearing,bearing_dms:bearing===null?null:formatBearingDms(bearing)}
 })
 return NextResponse.json({data:{beacons,distanceMode:near?'grid':null,fieldVerified:false}},{headers})
})
export const POST=apiHandler({auth:true,schema:publicControlSchema,rateLimit:{max:30,windowMs:60000}},async(_req,ctx)=>{
 const p=ctx.body as z.infer<typeof publicControlSchema>,info=assertProjectedCrs(p.horizontalCrs)
 const [lon,lat]=transformPoint(p.easting,p.northing,info.code,'EPSG:4326')
 const row=await db.transaction(async client=>{
  const beacon=(await client.query<{id:string;name:string;status:string;horizontal_crs:string;elevation:number|null}>(`INSERT INTO public_beacons(name,beacon_type,easting,northing,elevation,horizontal_crs,vertical_datum,source_reference,authority,country,description,datum,srid,geom,submitted_by,status)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,ST_Transform(ST_SetSRID(ST_MakePoint($14,$15),4326),21037),$16,'pending') RETURNING id,name,status,horizontal_crs,elevation`,
   [p.name,p.beaconType,p.easting,p.northing,p.elevation,info.code,p.verticalDatum,p.sourceReference,p.authority,p.country,p.description,info.datum,Number(info.code.slice(5)),lon,lat,ctx.userId])).rows[0]
  await logAuditEvent({userId:ctx.userId,action:'submit',resourceType:'public_beacons',resourceId:beacon.id,timestamp:new Date(),details:{input:p,catalogueReviewed:false,fieldVerified:false}},client)
  return beacon
 })
 return NextResponse.json({data:{beacon:row,fieldVerified:false}},{status:201,headers})
})
