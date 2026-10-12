'use client'
import { useCallback,useEffect,useRef,useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { getAvailableCountries,getBenchmarkTypes,searchBenchmarks,type Benchmark,type BenchmarkSearchParams,type BenchmarkType } from '@/lib/online/benchmarks'
export default function ReviewedBenchmarkSearch(){
 const {status}=useSession()
 const [countries,setCountries]=useState<string[]>([]),[country,setCountry]=useState(''),[type,setType]=useState<BenchmarkType|'ALL'>('ALL'),[q,setQ]=useState(''),[region,setRegion]=useState('')
 const [latitude,setLatitude]=useState(''),[longitude,setLongitude]=useState(''),[radius,setRadius]=useState('10')
 const [rows,setRows]=useState<Benchmark[]>([]),[total,setTotal]=useState(0),[searched,setSearched]=useState(false),[loading,setLoading]=useState(false)
 const [nextOffset,setNextOffset]=useState(0)
 const [error,setError]=useState<string|null>(null),[metadataError,setMetadataError]=useState<string|null>(null)
 const sequence=useRef(0),currentSearch=useRef<BenchmarkSearchParams|null>(null),metadataSequence=useRef(0)
 const loadCountries=useCallback(async()=>{
  const request=++metadataSequence.current;setMetadataError(null)
  try{const values=await getAvailableCountries();if(request===metadataSequence.current)setCountries(values)}catch(cause){if(request===metadataSequence.current)setMetadataError(cause instanceof Error?cause.message:'Countries could not be loaded')}
 },[])
 const cancelMetadata=useCallback(()=>{metadataSequence.current++},[])
 useEffect(()=>{if(status==='authenticated')void loadCountries();return cancelMetadata},[status,loadCountries,cancelMetadata])
 const cancelSearch=useCallback(()=>{sequence.current++;currentSearch.current=null;setRows([]);setTotal(0);setNextOffset(0);setSearched(false);setError(null);setLoading(false)},[])
 const cancelPendingSearch=useCallback(()=>{sequence.current++},[])
 useEffect(()=>cancelPendingSearch,[cancelPendingSearch])
 async function search(offset=0){
  const request=++sequence.current;setError(null);setLoading(true)
  if(!offset){setRows([]);setTotal(0);setSearched(false)}
  try{
   let parameters=currentSearch.current
   if(!offset){
    parameters={country:country||undefined,type,q:q.trim()||undefined,region:region.trim()||undefined,limit:25}
    if(latitude.trim()||longitude.trim()){
     if(!latitude.trim()||!longitude.trim()||!radius.trim()||![latitude,longitude,radius].every(value=>Number.isFinite(Number(value))))throw new Error('Enter complete latitude, longitude and radius values')
     parameters={...parameters,latitude:Number(latitude),longitude:Number(longitude),radiusKm:Number(radius)}
    }
    currentSearch.current=parameters
   }
   if(!parameters)return
   const result=await searchBenchmarks({...parameters,offset})
   if(request===sequence.current){setRows(previous=>offset?[...previous,...result.benchmarks.filter(row=>!previous.some(old=>old.id===row.id))]:result.benchmarks);setTotal(result.total);setNextOffset(result.offset+result.benchmarks.length);setSearched(true)}
  }catch(cause){if(request===sequence.current){setError(cause instanceof Error?cause.message:'Catalogue lookup failed');if(!offset)setRows([])}}
  finally{if(request===sequence.current)setLoading(false)}
 }
 const edit=(change:()=>void)=>{change();cancelSearch()}
 const inputClass='input w-full mt-1'
 if(status==='unauthenticated')return <section className="card p-6 space-y-3"><h2 className="text-xl font-semibold">Reviewed reference catalogue</h2><p>Sign in to search referenced control and register marks in your projects.</p><Link href="/login?next=%2Fonline" className="btn-primary inline-flex">Sign in to METARDU</Link></section>
 return <section className="card p-4 sm:p-6 space-y-4">
  <header><h2 className="text-xl font-semibold">Reviewed reference catalogue</h2><p className="text-sm text-[var(--text-secondary)] mt-2">Published source coordinates with independent catalogue review. Confirm the physical mark and project suitability before use. Nearby distances and azimuths are for navigation.</p></header>
  {metadataError&&<p role="alert" className="text-red-400">{metadataError} <button type="button" onClick={()=>void loadCountries()} className="underline">Retry countries</button></p>}
  <form onSubmit={event=>{event.preventDefault();void search()}} className="grid gap-4 sm:grid-cols-2">
   <label className="text-sm" htmlFor="reviewed-country">Country<select id="reviewed-country" className={inputClass} value={country} onChange={event=>edit(()=>setCountry(event.target.value))}><option value="">All published countries</option>{countries.map(value=><option key={value}>{value}</option>)}</select></label>
   <label className="text-sm" htmlFor="reviewed-type">Mark type<select id="reviewed-type" className={inputClass} value={type} onChange={event=>edit(()=>setType(event.target.value as BenchmarkType|'ALL'))}><option value="ALL">All reference types</option>{getBenchmarkTypes().map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
   <label className="text-sm" htmlFor="reviewed-name">Reference name<input id="reviewed-name" className={inputClass} value={q} onChange={event=>edit(()=>setQ(event.target.value))}/></label>
   <label className="text-sm" htmlFor="reviewed-region">Published county / region<input id="reviewed-region" className={inputClass} value={region} onChange={event=>edit(()=>setRegion(event.target.value))}/></label>
   <fieldset className="sm:col-span-2 border border-[var(--border-color)] rounded-lg p-3 grid gap-3 sm:grid-cols-3"><legend className="px-1 text-sm">Optional navigation location (WGS 84)</legend>
    <label className="text-sm" htmlFor="reviewed-latitude">Latitude (degrees)<input id="reviewed-latitude" type="number" step="any" min="-90" max="90" className={inputClass} value={latitude} onChange={event=>edit(()=>setLatitude(event.target.value))}/></label>
    <label className="text-sm" htmlFor="reviewed-longitude">Longitude (degrees)<input id="reviewed-longitude" type="number" step="any" min="-180" max="180" className={inputClass} value={longitude} onChange={event=>edit(()=>setLongitude(event.target.value))}/></label>
    <label className="text-sm" htmlFor="reviewed-radius">Radius (km)<input id="reviewed-radius" type="number" step="any" min="0" max="500" className={inputClass} value={radius} onChange={event=>edit(()=>setRadius(event.target.value))}/></label>
   </fieldset>
   <button className="btn-primary sm:col-span-2" disabled={loading||status==='loading'}>{loading?'Searching reviewed sources…':'Search reviewed references'}</button>
  </form>
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  {searched&&!rows.length&&<p role="status">No reviewed reference marks match this search. No official dataset is assumed to be available.</p>}
  {searched&&rows.length>0&&<p role="status" className="text-sm">Showing {rows.length} of {total} reviewed source records. Field verification remains required.</p>}
  <div className="space-y-3">{rows.map(row=><article key={row.id} className="border border-[var(--border-color)] rounded-lg p-4 space-y-2">
   <h3 className="font-semibold break-words">{row.name} · {row.type}</h3><p className="text-sm">{[row.region,row.country].filter(Boolean).join(', ')} · Catalogue reviewed {new Date(row.reviewedAt).toLocaleDateString()}</p>
   <p className="text-sm font-mono break-words">E {row.easting} m · N {row.northing} m · {row.horizontalCrs}</p>
   <p className="text-sm">{row.elevation===null?'Published height unknown':`Published height ${row.elevation.toFixed(3)} m · vertical datum ${row.verticalDatum}`}</p>
   {row.distanceKm!==undefined&&<p className="text-sm">Navigation distance {row.distanceKm.toFixed(3)} km · {row.navigationBearingDeg===null?'Coincident location; no azimuth':`navigation azimuth ${row.navigationBearingDeg?.toFixed(1)}°`}</p>}
   <p className="text-sm break-words">Publisher: {row.source} · Source: {row.sourceReference}</p>
  </article>)}</div>
  {nextOffset<total&&<button type="button" className="btn-secondary" disabled={loading} onClick={()=>void search(nextOffset)}>Load more references</button>}
  <p className="text-sm">Use the <Link href="/beacons" className="underline">reference catalogue import workflow</Link> to register a same-grid source in an owned project with retained evidence.</p>
 </section>
}
