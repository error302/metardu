'use client'
import {useEffect,useRef,useState} from 'react'
import {surfaceReviewReadSchema,surfaceReviewReceiptSchema,type SurfaceReviewCommand} from '@/lib/topo/surfaceReviewProtocol'
import type {z} from 'zod'
import {readPendingReview,preparePendingReview,acknowledgePendingReview,type PendingReview} from '@/lib/topo/reviewPending'
type History=z.infer<typeof surfaceReviewReadSchema>
type Receipt=z.infer<typeof surfaceReviewReceiptSchema>
interface Props {projectId:string;sourceRevisionId:string;expectedSourceHash:string;userId:string;onRecorded?:(receipt:Receipt)=>void}
const button='inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-color)] px-3 py-2 text-sm disabled:opacity-50'

export function SurfaceReviewPanel(props:Props){
  return <BoundReview key={`${props.userId}:${props.projectId}:${props.sourceRevisionId}`} {...props}/>
}
function BoundReview({projectId,sourceRevisionId,expectedSourceHash,userId,onRecorded}:Props){
  const [history,setHistory]=useState<History|null>(null),[reload,setReload]=useState(0)
  const [note,setNote]=useState(''),[outcome,setOutcome]=useState<SurfaceReviewCommand['outcome']>('changes_requested')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const [pending,setPending]=useState<PendingReview|null>(null),[recoveryReady,setRecoveryReady]=useState(false)
  const inFlight=useRef(false),post=useRef<AbortController|null>(null)
  useEffect(()=>{
    setRecoveryReady(false)
    try{
      const packet=readPendingReview({ownerId:userId,projectId,sourceRevisionId,sourceHash:expectedSourceHash})
      setPending(packet)
      if(packet){setNote(packet.command.note);setOutcome(packet.command.outcome)}
      setRecoveryReady(true)
    }catch(failure){setError(failure instanceof Error?failure.message:'Device review recovery is unavailable. No request was sent.')}
  },[userId,projectId,sourceRevisionId,expectedSourceHash,reload])
  useEffect(()=>()=>post.current?.abort(),[])
  useEffect(()=>{
    const controller=new AbortController();setHistory(null)
    void(async()=>{
      try{
        const response=await fetch(`/api/project/${projectId}/surface-reviews?sourceRevisionId=${sourceRevisionId}`,{cache:'no-store',signal:controller.signal})
        const raw:unknown=await response.json()
        if(!response.ok||!raw||typeof raw!=='object'||!('data'in raw))throw new Error('Could not load saved reviews. Refresh to check project access and connection.')
        const data=surfaceReviewReadSchema.parse(raw.data)
        if(data.source.revisionId!==sourceRevisionId||data.source.inputHash!==expectedSourceHash||data.reviews.some(review=>review.projectId!==projectId||review.sourceRevisionId!==sourceRevisionId||review.sourceHash!==expectedSourceHash))throw new Error('Review history does not match the selected source. Reload the saved revision.')
        if(!controller.signal.aborted)setHistory(data)
      }catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'Could not load saved reviews.')}
    })()
    return()=>controller.abort()
  },[projectId,sourceRevisionId,expectedSourceHash,reload])
  const canReview=!!history&&history.role!=='viewer'&&history.source.current&&recoveryReady
  const canSubmit=!!history&&history.role!=='viewer'&&(history.source.current||!!pending)&&recoveryReady
  async function save(){
    if(!canSubmit||!history||inFlight.current||!note.trim())return
    inFlight.current=true;setBusy(true);setError('');setMessage('')
    const controller=new AbortController();post.current=controller
    const binding={ownerId:userId,projectId,sourceRevisionId,sourceHash:expectedSourceHash}
    try{
      const packet=await preparePendingReview(binding,{
        command:pending?.command??{projectId,sourceRevisionId,expectedSourceHash,requestId:crypto.randomUUID(),outcome,note:note.trim()},
        sourceReferenceHash:pending?.sourceReferenceHash??history.source.referenceHash,sourceOutputHash:pending?.sourceOutputHash??history.source.outputHash})
      if(controller.signal.aborted)return
      setPending(packet);setNote(packet.command.note);setOutcome(packet.command.outcome)
      const command=packet.command
      const response=await fetch(`/api/project/${projectId}/surface-reviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),signal:controller.signal})
      const raw:unknown=await response.json()
      if(!response.ok){
        if([400,403,409,422].includes(response.status))setReload(value=>value+1)
        const details=raw&&typeof raw==='object'&&'error'in raw&&typeof raw.error==='string'?raw.error:'Review was not confirmed. Retry to check the same request.'
        throw new Error(details)
      }
      if(!raw||typeof raw!=='object'||!('data'in raw))throw new Error('Review acknowledgement is incomplete. Retry to check the same request.')
      const receipt=surfaceReviewReceiptSchema.parse(raw.data)
      if(!await acknowledgePendingReview(binding,packet,receipt))throw new Error('A different unconfirmed review is retained on this device. Refresh to recover it.')
      if(controller.signal.aborted)return
      setPending(null);setNote('');setMessage(`Internal review recorded${receipt.replayed?' (existing record recovered)':''}. Reference ${receipt.id}.`)
      onRecorded?.(receipt);setReload(value=>value+1)
    }catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'Review was not confirmed. Retry to check the same request.')}
    finally{inFlight.current=false;if(!controller.signal.aborted)setBusy(false)}
  }
  return <section aria-label="Saved source review" className="mt-6 space-y-4 rounded-lg border border-[var(--border-color)] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Office review</h2><p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">Review this exact saved source. Outputs remain computed drafts; an internal review does not establish field verification or professional approval.</p></div>
      <button type="button" className={button} disabled={busy} onClick={()=>{setError('');setReload(value=>value+1)}}>Refresh reviews</button>
    </div>
    {error&&<p role="alert" className="break-words text-sm">{error}</p>}
    {message&&<p role="status" className="break-words text-sm">{message}</p>}
    {!history?(!error?<p role="status">Loading saved reviews…</p>:<p className="text-sm">Saved reviews are unavailable. Use Refresh reviews to retry.</p>):<>
      {!history.source.current&&<p className="text-sm">This is a retained earlier revision. Select the current saved surface to record a new review.</p>}
      {history.role==='viewer'&&<p className="text-sm">Read-only project access. You can inspect the review history.</p>}
      <details className="text-sm"><summary className="cursor-pointer">Saved source evidence</summary><dl className="mt-2 space-y-2 break-all font-mono text-xs"><div><dt>Revision</dt><dd>{sourceRevisionId}</dd></div><div><dt>Source SHA-256</dt><dd>{history.source.inputHash}</dd></div><div><dt>Reference SHA-256</dt><dd>{history.source.referenceHash}</dd></div><div><dt>Output evidence SHA-256</dt><dd>{history.source.outputHash}</dd></div></dl></details>
      <form className="grid gap-3" onSubmit={event=>{event.preventDefault();void save()}}>
        <label className="grid gap-1 text-sm">Internal review outcome<select value={outcome} disabled={!canReview||busy||!!pending} className="min-h-11 min-w-0 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] px-3" onChange={event=>setOutcome(event.target.value as SurfaceReviewCommand['outcome'])}><option value="changes_requested">Changes requested</option><option value="reviewed_for_draft">Reviewed for draft</option></select></label>
        <label className="grid gap-1 text-sm">Review notes / corrections to request<textarea value={note} required maxLength={4000} rows={4} disabled={!canReview||busy||!!pending} className="min-h-28 min-w-0 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] p-3" onChange={event=>setNote(event.target.value)} placeholder="Identify the source issue and the action required."/></label>
        <button type="submit" className={`${button} justify-self-start`} disabled={!canSubmit||busy||!note.trim()}>{busy?'Recording review…':pending?'Retry same review request':'Record internal review'}</button>
        {pending&&!busy&&<p className="text-sm">An unconfirmed review is retained on this device. Retry checks the same request, including after a reload; it will not create a second record.</p>}
      </form>
      <div className="space-y-3" aria-label="Source review history">
        {!history.reviews.length?<p className="text-sm text-[var(--text-secondary)]">No internal reviews recorded for this saved source.</p>:history.reviews.map(review=><article key={review.id} className="space-y-2 border-t border-[var(--border-color)] pt-3 text-sm"><p className="font-medium">{review.outcome==='changes_requested'?'Changes requested':'Reviewed for draft'}</p><p className="whitespace-pre-wrap break-words">{review.note}</p><p className="break-all text-xs text-[var(--text-secondary)]">Actor {review.actorId} · {review.createdAt.replace('T',' ').replace('Z',' UTC')}</p></article>)}
        {history.historyLimited&&<p className="text-sm">Showing the latest 100 reviews. Older records are retained.</p>}
      </div>
    </>}
  </section>
}
