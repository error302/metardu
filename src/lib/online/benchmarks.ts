import { z } from 'zod'
export type BenchmarkType='BM'|'CP'|'TRIG'|'TIDAL'
export interface Benchmark {
 id:string;name:string;country:string;region:string|null;type:BenchmarkType;
 elevation:number|null;easting:number;northing:number;horizontalCrs:string;verticalDatum:string|null;
 latitude:number|null;longitude:number|null;source:string;sourceReference:string;
 reviewedAt:string;catalogueStatus:'reviewed';fieldVerified:false;
 distanceKm?:number;navigationBearingDeg?:number|null;
}
export interface BenchmarkSearchParams {
 country?:string;region?:string;q?:string;type?:BenchmarkType|'ALL';types?:BenchmarkType[];
 radiusKm?:number;latitude?:number;longitude?:number;limit?:number;offset?:number;
}
export interface BenchmarkSearchResult {benchmarks:Benchmark[];total:number;offset:number;limit:number;fromCache:false;navigationOnly:boolean}
const benchmark=z.object({id:z.string().uuid(),name:z.string(),country:z.string(),region:z.string().nullable(),type:z.enum(['BM','CP','TRIG','TIDAL']),elevation:z.number().finite().nullable(),easting:z.number().finite(),northing:z.number().finite(),horizontalCrs:z.string(),verticalDatum:z.string().nullable(),latitude:z.number().finite().nullable(),longitude:z.number().finite().nullable(),source:z.string(),sourceReference:z.string(),reviewedAt:z.string(),catalogueStatus:z.literal('reviewed'),fieldVerified:z.literal(false),distanceKm:z.number().finite().optional(),navigationBearingDeg:z.number().finite().nullable().optional()})
async function payload(response:Response):Promise<unknown>{const value:unknown=await response.json();if(!response.ok){const error=z.object({error:z.string().optional()}).safeParse(value);throw new Error(error.success&&error.data.error?error.data.error:'Reviewed catalogue could not be loaded')}return value}
/** Client API only: no embedded samples or account-independent offline cache. */
export async function searchBenchmarks(params:BenchmarkSearchParams):Promise<BenchmarkSearchResult>{
 const value=await payload(await fetch('/api/benchmarks/search',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(params)}))
 return z.object({benchmarks:z.array(benchmark),total:z.number().int().min(0),offset:z.number().int().min(0),limit:z.number().int().positive(),fromCache:z.literal(false),navigationOnly:z.boolean()}).parse(value)
}
export async function getBenchmarkById(id:string):Promise<Benchmark|null>{
 const response=await fetch(`/api/benchmarks/search?${new URLSearchParams({id})}`,{cache:'no-store'})
 if(response.status===404)return null
 return benchmark.parse(await payload(response))
}
export const getBenchmarksByCountry=(country:string)=>searchBenchmarks({country})
export async function getAvailableCountries():Promise<string[]>{
 return z.object({countries:z.array(z.string())}).parse(await payload(await fetch('/api/benchmarks/search?countries=true',{cache:'no-store'}))).countries
}
export function getBenchmarkTypes(){return [
 {id:'BM' as const,name:'Benchmark',description:'Published height reference mark'},
 {id:'CP' as const,name:'Control point',description:'Published control or GNSS reference mark'},
 {id:'TRIG' as const,name:'Trigonometric station',description:'Published trig reference mark'},
 {id:'TIDAL' as const,name:'Tidal benchmark',description:'Published mark with its stated tidal height datum'},
]}
