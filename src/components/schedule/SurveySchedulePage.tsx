'use client'

import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays,MapPin,Clock3,Plus,ArrowRight,FolderKanban } from 'lucide-react'
import { apiGet,apiPost,apiPatch } from '@/lib/api/client'
import {
  schedulesResponseSchema,scheduleResponseSchema,scheduleProjectsResponseSchema,
  collectorUrl,projectUrl,formatScheduleTime,localDateTime,localInputToInstant,
  type SurveySchedule,type ScheduleProject,
} from '@/lib/schedule/contracts'
import { SurveyPushSettings } from '@/components/notifications/SurveyPushSettings'

const inputClass='mt-2 min-h-12 w-full min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-base text-[var(--text-primary)]'
const statuses={upcoming:'Upcoming',in_progress:'In progress',completed:'Completed',cancelled:'Cancelled'} as const
type Filter='all'|SurveySchedule['status']
function ScheduleForm({initial,onSaved,onCancel,projectId}:{initial:SurveySchedule|null;onSaved:(schedule:SurveySchedule)=>void;onCancel:()=>void;projectId:string|null}) {
  const [project,setProject]=useState(initial?.project_id??projectId??'')
  const [search,setSearch]=useState(''),[projects,setProjects]=useState<ScheduleProject[]>([])
  const [searching,setSearching]=useState(true),[moreProjects,setMoreProjects]=useState(false),[projectError,setProjectError]=useState('')
  const [title,setTitle]=useState(initial?.title??''),[location,setLocation]=useState(initial?.location??''),[notes,setNotes]=useState(initial?.notes??'')
  const [start,setStart]=useState(localDateTime(initial&&(initial.status==='upcoming'||initial.status==='in_progress')?initial.starts_at:new Date(Date.now()+3600000).toISOString()))
  const [zone,setZone]=useState('UTC'),[duration,setDuration]=useState(initial?.duration_minutes??120)
  const [reminders,setReminders]=useState(initial?.reminder_minutes??[1440,60])
  const [saving,setSaving]=useState(false),[error,setError]=useState('')
  const requestId=useRef<string|null>(null)
  useEffect(()=>{setZone(Intl.DateTimeFormat().resolvedOptions().timeZone)},[])
  useEffect(()=>{
    let active=true
    const controller=new AbortController()
    const timer=setTimeout(()=>{
      setSearching(true);setProjectError('')
      void apiGet('/api/schedules/projects?q='+encodeURIComponent(search),scheduleProjectsResponseSchema,{ttlMs:0,signal:controller.signal})
        .then(data=>{if(active){setProjects(data.projects);setMoreProjects(data.hasMore)}})
        .catch(()=>{if(active)setProjectError('Projects could not be loaded. Check your connection and try searching again.')})
        .finally(()=>{if(active)setSearching(false)})
    },250)
    return()=>{active=false;clearTimeout(timer);controller.abort()}
  },[search])
  useEffect(()=>{
    if(!project||projects.some(item=>item.id===project))return
    let active=true
    const controller=new AbortController()
    void apiGet('/api/schedules/projects?projectId='+encodeURIComponent(project),scheduleProjectsResponseSchema,{ttlMs:0,signal:controller.signal})
      .then(data=>{if(active&&data.projects[0])setProjects(items=>[data.projects[0],...items.filter(item=>item.id!==project)])})
      .catch(()=>{if(active)setProjectError('The selected project could not be checked. Choose an available project before saving.')})
    return()=>{active=false;controller.abort()}
  },[project,projects])
  const chooseProject=(id:string)=>{
    setProject(id)
    const selected=projects.find(item=>item.id===id)
    if(selected){if(!title.trim())setTitle('Field survey — '+selected.name);if(!location.trim())setLocation(selected.location??'')}
  }
  const save=async(event:FormEvent)=>{
    event.preventDefault()
    if(saving)return
    setSaving(true);setError('')
    try {
      const data={project_id:project,title:title.trim(),notes,location,starts_at:localInputToInstant(start),
        time_zone:zone,duration_minutes:duration,reminder_minutes:[...reminders].sort((a,b)=>b-a)}
      let saved:SurveySchedule
      if(initial)saved=(await apiPatch('/api/schedules/'+initial.id,scheduleResponseSchema,{
        ...data,version:initial.version,status:initial.status==='cancelled'||initial.status==='completed'?'upcoming':initial.status,
      })).schedule
      else {
        requestId.current??=crypto.randomUUID()
        saved=(await apiPost('/api/schedules',scheduleResponseSchema,{...data,request_id:requestId.current})).schedule
      }
      onSaved(saved)
    } catch(err){setError(err instanceof Error?err.message:'The job could not be saved. Your form is still open.')}
    finally{setSaving(false)}
  }
  const selected=projects.find(item=>item.id===project)
  return <form onSubmit={save} className="space-y-5" aria-label="Schedule survey job">
    <section className="card p-5 sm:p-6" aria-labelledby="schedule-project-heading">
      <h2 id="schedule-project-heading" className="text-lg font-semibold">Project and field time</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">Choose the project you will collect points in. Its reference system and existing records stay with the project.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="schedule-project-search" className="text-sm font-medium">Find a project</label><input id="schedule-project-search" value={search} onChange={e=>setSearch(e.target.value)} className={inputClass} placeholder="Search project names" type="search"/></div>
        <div><label htmlFor="schedule-project" className="text-sm font-medium">Survey project</label><select id="schedule-project" required value={project} onChange={e=>chooseProject(e.target.value)} className={inputClass}><option value="">Choose a project</option>{projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      </div>
      {searching&&<p role="status" className="mt-2 text-sm text-[var(--text-secondary)]">Loading projects…</p>}
      {projectError&&<p role="alert" className="mt-2 text-sm text-[var(--text-primary)]">{projectError}</p>}
      {moreProjects&&<p className="mt-2 text-sm text-[var(--text-secondary)]">More projects match. Refine the name to find yours.</p>}
      {!searching&&!projects.length&&!projectError&&<p className="mt-2 text-sm text-[var(--text-secondary)]">No matching projects. <Link href="/project/new" className="text-[var(--accent)] underline">Create a project</Link> before scheduling fieldwork.</p>}
      {selected&&!selected.can_collect&&<p className="mt-3 text-sm text-[var(--text-secondary)]">Your current role can open this project for review. Field collection requires a project role with write access.</p>}
      <div className="mt-4"><label htmlFor="schedule-title" className="text-sm font-medium">Job title</label><input id="schedule-title" required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} className={inputClass}/></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="schedule-start" className="text-sm font-medium">Start date and time</label><input id="schedule-start" type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)} className={inputClass}/><p className="mt-2 text-xs text-[var(--text-secondary)]">Device time zone: {zone}. The saved instant is retained if you travel.</p></div>
        <div><label htmlFor="schedule-duration" className="text-sm font-medium">Expected duration in minutes</label><input id="schedule-duration" type="number" required min={15} max={1440} step={15} value={duration} onChange={e=>setDuration(Number(e.target.value))} className={inputClass}/></div>
      </div>
      <div className="mt-4"><label htmlFor="schedule-location" className="text-sm font-medium">Meeting point or site</label><input id="schedule-location" value={location} maxLength={300} onChange={e=>setLocation(e.target.value)} className={inputClass}/></div>
    </section>
    <section className="card p-5 sm:p-6" aria-labelledby="schedule-reminder-heading">
      <h2 id="schedule-reminder-heading" className="text-lg font-semibold">Reminder times</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">A booking confirmation is queued when you save. Choose additional reminders before fieldwork starts; phone alerts require an enabled device.</p>
      <fieldset className="mt-4 flex flex-wrap gap-3"><legend className="sr-only">Additional reminders</legend>{[[10080,'7 days before'],[1440,'24 hours before'],[60,'1 hour before'],[0,'At the start']] .map(([minutes,label])=><label key={minutes} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 text-sm"><input type="checkbox" checked={reminders.includes(Number(minutes))} onChange={e=>setReminders(values=>e.target.checked?[...values,Number(minutes)]:values.filter(value=>value!==minutes))}/>{label}</label>)}</fieldset>
    </section>
    <section className="card p-5 sm:p-6"><label htmlFor="schedule-notes" className="text-lg font-semibold">Field notes</label><p className="mt-2 text-sm text-[var(--text-secondary)]">Access arrangements, equipment and crew notes for this job.</p><textarea id="schedule-notes" rows={4} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)} className={inputClass}/></section>
    {error&&<p role="alert" className="rounded-lg border border-[var(--border-color)] p-4 text-sm">{error}</p>}
    <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={onCancel} disabled={saving} className="btn btn-secondary min-h-11">Cancel</button><button disabled={saving||!project||searching} className="btn btn-primary min-h-11 disabled:opacity-60">{saving?'Saving…':initial?'Save job changes':'Schedule survey'}</button></div>
  </form>
}
export function SurveySchedulePage({focusedJob,selectedProject,newJob}:{focusedJob:string|null;selectedProject:string|null;newJob:boolean}) {
  const {data:session,status:authStatus}=useSession(),router=useRouter()
  const [jobs,setJobs]=useState<SurveySchedule[]>([]),[filter,setFilter]=useState<Filter>('upcoming')
  const [loading,setLoading]=useState(true),[hasMore,setHasMore]=useState(false),[error,setError]=useState('')
  const [editing,setEditing]=useState<SurveySchedule|null>(null),[showForm,setShowForm]=useState(false)
  const [initialProject,setInitialProject]=useState<string|null>(null),[highlight,setHighlight]=useState<string|null>(null)
  const [busy,setBusy]=useState<string|null>(null),[cancelTarget,setCancelTarget]=useState<string|null>(null),[notice,setNotice]=useState('')
  useEffect(()=>{
    setShowForm(newJob)
    if(newJob)setInitialProject(selectedProject)
    setHighlight(focusedJob)
    if(focusedJob)setFilter('all')
  },[newJob,selectedProject,focusedJob])
  const requests=useRef<AbortController|null>(null)
  const jobsRef=useRef(jobs)
  jobsRef.current=jobs
  const load=useCallback(async(append=false)=>{
    if(authStatus!=='authenticated')return
    requests.current?.abort()
    const controller=new AbortController();requests.current=controller
    setLoading(true);setError('')
    try{
      const offset=append?jobsRef.current.length:0
      const query=new URLSearchParams({offset:String(offset)})
      if(filter!=='all')query.set('status',filter)
      const data=highlight
        ? {schedules:[(await apiGet('/api/schedules/'+encodeURIComponent(highlight),scheduleResponseSchema,{ttlMs:0,signal:controller.signal})).schedule],hasMore:false}
        : await apiGet('/api/schedules?'+query.toString(),schedulesResponseSchema,{ttlMs:0,signal:controller.signal})
      if(controller.signal.aborted)return
      setJobs(old=>append?[...old,...data.schedules.filter(item=>!old.some(prior=>prior.id===item.id))]:data.schedules)
      setHasMore(data.hasMore)
    }catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:'Jobs could not be loaded. Try again.')}
    finally{if(!controller.signal.aborted)setLoading(false)}
  },[authStatus,filter,highlight])
  useEffect(()=>{void load();return()=>requests.current?.abort()},[load])
  const changeStatus=async(job:SurveySchedule,status:SurveySchedule['status'],collect=false)=>{
    if(busy)return
    setBusy(job.id);setError('')
    try{
      await apiPatch('/api/schedules/'+job.id,scheduleResponseSchema,{version:job.version,status})
      setCancelTarget(null)
      if(collect&&job.project_id)router.push(collectorUrl(job.project_id))
      else await load()
    }catch(err){setError(err instanceof Error?err.message:'The job update was not confirmed.')}
    finally{setBusy(null)}
  }
  if(authStatus==='loading')return <div role="status" className="mx-auto max-w-5xl p-6">Preparing your survey schedule…</div>
  if(!session)return <div className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-semibold">Survey schedule</h1><p className="mt-3">Sign in to view your projects and scheduled work.</p><Link href="/login?next=%2Fschedule" className="btn btn-primary mt-4">Sign in</Link></div>
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">Field operations</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{showForm?(editing?'Edit scheduled survey':'Schedule a survey'):highlight?'Scheduled survey':'Survey schedule'}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">{showForm?'Link the project, set the field time and prepare your reminders.':'Plan the job, open its project and continue straight to point collection.'}</p></div>{!showForm&&<button type="button" onClick={()=>{setEditing(null);setInitialProject(null);setShowForm(true);setNotice('')}} className="btn btn-primary min-h-11"><Plus aria-hidden="true" className="h-4 w-4"/>Schedule job</button>}</div>
    {showForm?<ScheduleForm initial={editing} projectId={initialProject} onCancel={()=>{setShowForm(false);setEditing(null);if(new URLSearchParams(window.location.search).has('new'))router.replace('/schedule',{scroll:false})}} onSaved={saved=>{
        setShowForm(false);setEditing(null);setHighlight(saved.id);setFilter('all');setJobs([saved]);setHasMore(false)
        router.replace('/schedule?job='+saved.id,{scroll:false})
        setNotice('Survey saved. Check phone reminder settings above to enable this device.')
      }}/>:<>
      <SurveyPushSettings/>
      {highlight&&<Link href="/schedule" onClick={()=>setHighlight(null)} className="btn btn-secondary mt-5 min-h-11">View all jobs</Link>}
      {notice&&<p role="status" className="mt-4 text-sm text-[var(--text-secondary)]">{notice}</p>}
      {!highlight&&<div className="my-6 flex flex-wrap gap-2" aria-label="Schedule status">{(['upcoming','in_progress','completed','cancelled','all'] as Filter[]).map(value=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)} className={'min-h-11 rounded-lg border px-3 text-sm '+(filter===value?'border-[var(--accent)] text-[var(--accent)]':'border-[var(--border-color)] text-[var(--text-secondary)]')}>{value==='all'?'All jobs':statuses[value]}</button>)}</div>}
      {error&&<div role="alert" className="mb-4 card p-4 text-sm"><p>{error}</p><button type="button" onClick={()=>{void load()}} className="mt-2 min-h-11 text-[var(--accent)] underline">Retry schedules</button></div>}
      {loading&&!jobs.length?<p role="status" className="py-8 text-sm text-[var(--text-secondary)]">Loading scheduled surveys…</p>:!jobs.length&&!error?<section className="card p-8"><CalendarDays aria-hidden="true" className="h-7 w-7 text-[var(--accent)]"/><h2 className="mt-4 text-lg font-semibold">No {filter==='all'?'scheduled':filter.replace('_',' ')} surveys</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">Your jobs appear here after they are saved. Schedule one against an existing project to prepare for field collection.</p></section>:null}
      <div className="space-y-4">{jobs.map(job=><article key={job.id} className={'card p-5 sm:p-6 '+(highlight===job.id?'ring-1 ring-[var(--accent)]':'')} aria-label={job.title}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{statuses[job.status]}</p><h2 className="mt-2 break-words text-lg font-semibold">{job.title}</h2><p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]"><FolderKanban aria-hidden="true" className="h-4 w-4 shrink-0"/>{job.project_name??'Project access is unavailable'}</p></div><button type="button" onClick={()=>{setEditing(job);setShowForm(true)}} className="btn btn-secondary min-h-11">{job.status==='cancelled'||job.status==='completed'?'Reschedule':'Edit job'}</button></div>
        <p className="mt-4 flex items-start gap-2 text-sm"><Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0"/><span>{formatScheduleTime(job.starts_at,job.time_zone)} · {job.time_zone} · {job.duration_minutes} min</span></p>
        {job.location&&<p className="mt-2 flex items-start gap-2 break-words text-sm text-[var(--text-secondary)]"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0"/>{job.location}</p>}
        {job.notes&&<p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-secondary)]">{job.notes}</p>}
        <div className="mt-5 flex flex-wrap gap-3">{job.project_id&&job.project_name&&<Link href={projectUrl(job.project_id)} className="btn btn-secondary min-h-11">Open project</Link>}
          {job.can_collect&&job.project_id&&job.status==='upcoming'&&<button type="button" disabled={busy===job.id} onClick={()=>{void changeStatus(job,'in_progress',true)}} className="btn btn-primary min-h-11">Start field collection<ArrowRight aria-hidden="true" className="h-4 w-4"/></button>}
          {job.can_collect&&job.project_id&&job.status==='in_progress'&&<Link href={collectorUrl(job.project_id)} className="btn btn-primary min-h-11">Continue point collection</Link>}
          {job.status==='in_progress'&&<button type="button" disabled={busy===job.id} onClick={()=>{void changeStatus(job,'completed')}} className="btn btn-secondary min-h-11">Mark completed</button>}
          {(job.status==='upcoming'||job.status==='in_progress')&&<button type="button" disabled={busy===job.id} onClick={()=>setCancelTarget(job.id)} className="min-h-11 rounded-lg px-3 text-sm text-[var(--text-secondary)] underline">Cancel job</button>}
        </div>
        {cancelTarget===job.id&&<div className="mt-4 rounded-lg border border-[var(--border-color)] p-4"><p className="text-sm">Cancel this job and stop its pending reminders? The record will remain in your schedule.</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy===job.id} onClick={()=>{void changeStatus(job,'cancelled')}} className="btn btn-secondary min-h-11">Confirm cancellation</button><button type="button" onClick={()=>setCancelTarget(null)} className="btn btn-secondary min-h-11">Keep job</button></div></div>}
      </article>)}</div>
      {hasMore&&<button type="button" onClick={()=>{void load(true)}} disabled={loading} className="btn btn-secondary mt-5 min-h-11">{loading?'Loading…':'Load more jobs'}</button>}
    </>}
  </div>
}
