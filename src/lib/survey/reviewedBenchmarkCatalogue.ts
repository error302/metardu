import { db } from '@/lib/db'
import type { Benchmark,BenchmarkSearchParams,BenchmarkSearchResult } from '@/lib/online/benchmarks'

interface Row {id:string;name:string;country:string;county:string|null;type:Benchmark['type'];elevation:number|null;easting:number;northing:number;horizontal_crs:string;vertical_datum:string|null;latitude:number|null;longitude:number|null;authority:string;source_reference:string;reviewed_at:string;distance_m?:number;navigation_bearing_deg?:number|null}
const eligible=`b.status='verified' AND b.beacon_type IN ('benchmark','control','trig','gnss','boundary','tidal')
 AND NULLIF(trim(b.horizontal_crs),'') IS NOT NULL AND NULLIF(trim(b.country),'') IS NOT NULL
 AND NULLIF(trim(b.authority),'') IS NOT NULL AND NULLIF(trim(b.source_reference),'') IS NOT NULL
 AND b.easting>'-Infinity'::float8 AND b.easting<'Infinity'::float8 AND b.northing>'-Infinity'::float8 AND b.northing<'Infinity'::float8
 AND (b.elevation IS NULL OR (b.elevation>'-Infinity'::float8 AND b.elevation<'Infinity'::float8 AND NULLIF(trim(b.vertical_datum),'') IS NOT NULL))
 AND EXISTS(SELECT 1 FROM public.public_beacon_reviews r WHERE r.beacon_id=b.id AND r.decision='verified' AND r.reviewer_id=b.verified_by AND r.created_at=b.verified_at
  AND r.reviewer_id IS DISTINCT FROM b.submitted_by
  AND (r.source_snapshot-ARRAY['status','verified_by','verified_at','updated_at'])=(to_jsonb(b)-ARRAY['status','verified_by','verified_at','updated_at']))`
const typeSql="CASE b.beacon_type WHEN 'benchmark' THEN 'BM' WHEN 'trig' THEN 'TRIG' WHEN 'tidal' THEN 'TIDAL' ELSE 'CP' END"
const dto=(row:Row):Benchmark=>({id:row.id,name:row.name,country:row.country,region:row.county,type:row.type,elevation:row.elevation,easting:row.easting,northing:row.northing,horizontalCrs:row.horizontal_crs,verticalDatum:row.vertical_datum,latitude:row.latitude,longitude:row.longitude,source:row.authority,sourceReference:row.source_reference,reviewedAt:row.reviewed_at,catalogueStatus:'reviewed',fieldVerified:false,...(row.distance_m===undefined?{}:{distanceKm:row.distance_m/1000,navigationBearingDeg:row.navigation_bearing_deg??null})})

/** The saved source grid drives navigation transforms; the legacy geom/SRID default never does. */
export async function readReviewedBenchmarks(params:BenchmarkSearchParams,id?:string):Promise<BenchmarkSearchResult>{
 const values:unknown[]=[],bind=(value:unknown)=>{values.push(value);return `$${values.length}`}
 const filters=[eligible]
 if(id)filters.push(`b.id=${bind(id)}`)
 if(params.q)filters.push(`b.name ILIKE ${bind('%'+params.q+'%')}`)
 if(params.country)filters.push(`lower(b.country)=lower(${bind(params.country)})`)
 if(params.region)filters.push(`b.county ILIKE ${bind('%'+params.region+'%')}`)
 if(params.type&&params.type!=='ALL')filters.push(`${typeSql}=${bind(params.type)}`)
 if(params.types)filters.push(`${typeSql}=ANY(${bind(params.types)}::text[])`)
 const near=params.latitude!==undefined&&params.longitude!==undefined
 const origin=near?`ST_SetSRID(ST_MakePoint(${bind(params.longitude)},${bind(params.latitude)}),4326)::geography`:''
 const radius=near?bind((params.radiusKm??50)*1000):''
 const limit=params.limit??100,offset=params.offset??0
 // All eligibility/name/type filters precede transformation; geographic radius
 // filtering and ordering precede pagination. PostGIS supplies spheroidal metres.
 const query=`WITH sources AS MATERIALIZED (
  SELECT b.id,b.name,b.country,b.county,${typeSql} AS type,b.elevation,b.easting,b.northing,b.horizontal_crs,b.vertical_datum,b.authority,b.source_reference,b.verified_at AS reviewed_at,
   ST_Transform(ST_SetSRID(ST_MakePoint(b.easting,b.northing),s.srid),4326) AS navigation_geometry
  FROM public.public_beacons b JOIN public.spatial_ref_sys s ON s.srid=substring(b.horizontal_crs FROM '^EPSG:([0-9]{4,6})$')::integer
  WHERE s.srid<>3857 AND s.srtext LIKE 'PROJCS%' AND s.proj4text ~ '(^|[[:space:]])[+]units=m([[:space:]]|$)' AND ${filters.join(' AND ')}
 ), matched AS MATERIALIZED (
  SELECT id,name,country,county,type,elevation,easting,northing,horizontal_crs,vertical_datum,authority,source_reference,reviewed_at,
   ST_Y(navigation_geometry) AS latitude,ST_X(navigation_geometry) AS longitude
   ${near?`,ST_Distance(${origin},navigation_geometry::geography) AS distance_m,degrees(ST_Azimuth(${origin},navigation_geometry::geography)) AS navigation_bearing_deg`:''}
  FROM sources ${near?`WHERE ST_DWithin(navigation_geometry::geography,${origin},${radius})`:''}
 ), paged AS (
  SELECT * FROM matched ORDER BY ${near?'distance_m,id':'name,id'} LIMIT ${bind(limit)} OFFSET ${bind(offset)}
 ) SELECT (SELECT count(*)::integer FROM matched) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(paged) ORDER BY ${near?'distance_m,id':'name,id'}) FROM paged),'[]'::jsonb) AS records`
 const result=(await db.query<{total:number;records:Row[]}>(query,values)).rows[0]
 return {benchmarks:result.records.map(dto),total:result.total,offset,limit,fromCache:false,navigationOnly:near}
}
export async function readReviewedBenchmarkCountries():Promise<string[]>{
 return (await db.query<{country:string}>(`SELECT DISTINCT b.country FROM public.public_beacons b JOIN public.spatial_ref_sys s ON s.srid=substring(b.horizontal_crs FROM '^EPSG:([0-9]{4,6})$')::integer WHERE s.srid<>3857 AND s.srtext LIKE 'PROJCS%' AND s.proj4text ~ '(^|[[:space:]])[+]units=m([[:space:]]|$)' AND ${eligible} ORDER BY b.country`)).rows.map(row=>row.country)
}
