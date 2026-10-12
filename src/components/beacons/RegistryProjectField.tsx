'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export interface RegistryProject { id: string; name: string; horizontalCrs: string | null; verticalDatum: string | null }
export function RegistryProjectField({ value, onChange, onlyId, disabled = false }: {
  value: RegistryProject | null; onChange: (project: RegistryProject | null) => void; onlyId?: string | null; disabled?: boolean
}) {
  const [projects, setProjects] = useState<RegistryProject[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)
  const load = useCallback(async (next?: string) => {
    const request = ++sequence.current
    setLoading(true); setError(null)
    try {
      const query = new URLSearchParams({ limit: '25', q: search })
      if (next) query.set('cursor', next)
      if (onlyId) query.set('id', onlyId)
      const response = await fetch(`/api/beacons/projects?${query}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Owned projects could not be loaded. Retry the search.')
      const payload = await response.json() as { data?: { projects?: RegistryProject[]; nextCursor?: string | null } }
      if (!Array.isArray(payload.data?.projects)) throw new Error('Owned projects could not be loaded.')
      if (request !== sequence.current) return
      const rows = payload.data.projects
      setProjects(previous => next ? [...previous, ...rows.filter(row => !previous.some(old => old.id === row.id))] : rows)
      setCursor(payload.data.nextCursor ?? null)
    } catch (cause) { if (request === sequence.current) setError(cause instanceof Error ? cause.message : 'Project search failed') }
    finally { if (request === sequence.current) setLoading(false) }
  }, [search, onlyId])
  const cancel = useCallback(() => { sequence.current++ }, [])
  useEffect(() => { void load(); return cancel }, [load, cancel])
  return <div className="space-y-2">
    <label className="block text-xs text-[var(--text-secondary)]">Owned project
      <input aria-label="Find owned project" disabled={disabled} value={search} onChange={event => setSearch(event.target.value)} placeholder="Find by name" className="input mt-1 w-full" />
    </label>
    <select aria-label="Owned project" disabled={disabled} className="input w-full" value={value?.id ?? ''} onChange={event => onChange(projects.find(project => project.id === event.target.value) ?? null)}>
      <option value="">Choose an owned project</option>
      {projects.map(project => <option key={project.id} value={project.id}>{project.name}{project.horizontalCrs ? ` (${project.horizontalCrs})` : ' — reference not declared'}</option>)}
    </select>
    {loading && <p role="status" className="text-xs text-[var(--text-muted)]">Loading owned projects…</p>}
    {error && <p role="alert" className="text-xs text-red-400">{error} <button type="button" onClick={() => void load()} className="underline">Retry</button></p>}
    {cursor && <button type="button" disabled={loading || disabled} onClick={() => void load(cursor)} className="text-xs text-[var(--accent)]">Load more projects</button>}
    {!loading && !error && !projects.length && <p className="text-xs text-[var(--text-muted)]">No matching owned projects. <Link href="/dashboard" className="underline">Open projects</Link></p>}
    {value && <p className="text-xs text-[var(--text-muted)]">{value.horizontalCrs ? `Grid: ${value.horizontalCrs}. Vertical datum: ${value.verticalDatum ?? 'not declared'}.` : 'Declare the project reference before recording coordinates.'} <Link href={`/project/${value.id}/settings`} className="underline">Reference settings</Link></p>}
  </div>
}
