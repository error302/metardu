'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import PipelineWorkspace from './Workspace'
interface ProjectListResponse { data?: Array<{ id: string; name: string }>; error?: string; pagination?: { nextCursor?: string | null } }

export default function ProjectSelector() {
  const { data: session, status } = useSession()
  const userId = session?.user?.id ?? null
  return <AccountWorkspace key={userId ?? status} userId={userId} />
}
function AccountWorkspace({ userId }: { userId: string | null }) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (userId) setProjectId(new URLSearchParams(window.location.search).get('projectId'))
  }, [userId])
  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    fetch('/api/projects?limit=200', { cache: 'no-store' }).then(async response => {
      const payload = await response.json() as ProjectListResponse
      if (!response.ok || !Array.isArray(payload.data)) throw new Error(payload.error || 'Could not load private projects.')
      if (!active) return
      setProjects(payload.data.map((project: { id: string; name: string }) => ({ id: project.id, name: project.name })))
      setCursor(payload.pagination?.nextCursor ?? null)
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load projects.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId])
  const loadMore = async () => {
    if (!cursor || loading) return
    setLoading(true); setError(null)
    try {
      const response = await fetch(`/api/projects?limit=200&cursor=${encodeURIComponent(cursor)}`, { cache: 'no-store' })
      const payload = await response.json() as ProjectListResponse
      if (!response.ok || !Array.isArray(payload.data)) throw new Error(payload.error || 'Could not load more projects.')
      const nextProjects = payload.data
      setProjects(previous => [...previous, ...nextProjects.filter(project => !previous.some(existing => existing.id === project.id))])
      setCursor(payload.pagination?.nextCursor ?? null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load projects.') }
    finally { setLoading(false) }
  }
  return <>
    <div className="mx-auto max-w-6xl px-4 pt-6 text-sm text-[var(--text-primary)]">
      {userId ? <>
        <label htmlFor="pipeline-project" className="mb-2 block">Private project / local draft</label>
        <select id="pipeline-project" value={projectId ?? ''} disabled={busy} className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3" onChange={event => {
          const next = event.target.value || null
          if (dirty && !window.confirm('Changing project clears this form. Download or save the current draft first if you need it. Continue?')) return
          setDirty(false); setProjectId(next)
        }}>
          <option value="">Local draft — not saved to a project</option>
          {projectId && !projects.some(project => project.id === projectId) && <option value={projectId}>Project from workspace link</option>}
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        {loading && <p role="status">Loading private projects…</p>}
        {cursor && <button disabled={loading} onClick={() => void loadMore()} className="min-h-11 underline">Load more projects</button>}
        {error && <p role="alert">{error}</p>}
      </> : <p><a href="/login?next=%2Ftools%2Fpipeline-asbuilt" className="underline">Sign in</a> to save and reopen private project profiles. You can still analyze and export a local draft.</p>}
    </div>
    <PipelineWorkspace key={projectId ?? 'local'} projectId={projectId} onDirty={setDirty} onBusy={setBusy} />
  </>
}
