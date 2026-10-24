'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { CheckCircle2, Circle, ArrowRight, type LucideIcon } from 'lucide-react'
import { z } from 'zod'
import { PageHeader } from '@/components/shared/PageHeader'
import { ProjectPicker } from '@/components/field/ProjectPicker'
import { resolveDeclaredStageReference, type StageReference } from '@/lib/workspaces/stageReference'

interface ReviewStep { id: string; title: string; description: string; href: string; icon: LucideIcon; optional?: boolean }
const contextSchema = z.object({ data: z.object({ referenceSystem: z.unknown(), referenceHash: z.string().regex(/^[a-f0-9]{64}$/) }) })
const notesSchema = z.object({ version: z.literal(1), reviewed: z.array(z.string()).max(20) }).strict()
const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-color)] px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]'

function projectHref(step: ReviewStep, projectId: string) {
  const project = `/project/${encodeURIComponent(projectId)}`
  if (step.id === 'reference') return `${project}/settings`
  if (step.id === 'import') return `${project}/observe`
  if (step.id === 'export') return `${project}/deliver`
  if (step.id === 'contours' || step.id === 'drawing') return `${step.href}?project=${encodeURIComponent(projectId)}`
  return step.href
}

export default function TopographicProjectReview({ steps }: { steps: ReviewStep[] }) {
  const { data: session, status } = useSession()
  if (status === 'loading') return <p role="status" className="p-6">Checking account…</p>
  const userId = session?.user?.id
  if (status !== 'authenticated' || !userId) return <div className="mx-auto max-w-5xl px-4 py-8">
    <PageHeader title="Topographic workflow" subtitle="Review project sources, terrain and deliverables." />
    <p><Link href="/login?next=%2Ftopographic-workflow" className="underline">Sign in</Link> to choose a project. Review notes are kept separately for each account on this device.</p>
  </div>
  return <ProjectSelection key={userId} userId={userId} steps={steps} />
}

function ProjectSelection({ userId, steps }: { userId: string; steps: ReviewStep[] }) {
  const [projectId, setProjectId] = useState<string | null>(null)
  const onPick = useCallback((id: string) => setProjectId(id), [])
  if (!projectId) return <ProjectPicker onPick={onPick} title="Topographic workflow" subtitle="Choose the project whose sources and deliverables you want to review." />
  return <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href={`/project/${encodeURIComponent(projectId)}`} className="text-sm underline">Project workspace</Link>
      <button type="button" className={buttonClass} onClick={() => setProjectId(null)}>Change project</button>
    </div>
    <PageHeader title="Topographic workflow" subtitle="Review this project's control, original observations, terrain and handover." />
    <ProjectReference key={projectId} userId={userId} projectId={projectId} steps={steps} />
  </div>
}

function ProjectReference({ userId, projectId, steps }: { userId: string; projectId: string; steps: ReviewStep[] }) {
  const [attempt, setAttempt] = useState(0)
  const [context, setContext] = useState<{ reference: StageReference; hash: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setContext(null); setError('')
    void (async () => {
      try {
        const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/point-imports`, { cache: 'no-store', signal: controller.signal })
        const raw: unknown = await response.json()
        const parsed = contextSchema.safeParse(raw)
        if (!response.ok || !parsed.success) throw new Error('Could not load the project reference. Check your connection and project access, then retry.')
        if (!controller.signal.aborted) setContext({ reference: resolveDeclaredStageReference(parsed.data.data.referenceSystem), hash: parsed.data.data.referenceHash })
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load the project reference.')
      }
    })()
    return () => controller.abort()
  }, [projectId, attempt])
  if (error) return <div className="space-y-3"><p role="alert">{error}</p><button type="button" className={buttonClass} onClick={() => setAttempt(value => value + 1)}>Retry project reference</button></div>
  if (!context) return <p role="status">Loading project reference…</p>
  return <ReviewChecklist key={context.hash} {...{ userId, projectId, steps }} reference={context.reference} referenceHash={context.hash} />
}

function ReviewChecklist({ userId, projectId, referenceHash, reference, steps }: { userId: string; projectId: string; referenceHash: string; reference: StageReference; steps: ReviewStep[] }) {
  const storageKey = `metardu:topo-review:v1:${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}:${referenceHash}`
  const [reviewed, setReviewed] = useState<string[]>([])
  const [storageError, setStorageError] = useState('')
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return
      const parsed = notesSchema.safeParse(JSON.parse(saved) as unknown)
      if (!parsed.success) throw new Error('Invalid review notes')
      setReviewed([...new Set(parsed.data.reviewed.filter(id => steps.some(step => step.id === id)))])
    } catch { setStorageError('Saved review notes could not be read. Existing device data was kept.') }
  }, [storageKey, steps])

  function saveNotes(next: string[]) {
    setReviewed(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, reviewed: next }))
      setStorageError('')
    } catch { setStorageError('Could not save review notes on this device. They are available in this view only.') }
  }

  return <>
    <section aria-label="Saved project reference" className="mb-6 border-l-2 border-[var(--accent)] pl-4 text-sm">
      <p className="mb-1 text-[var(--text-muted)]">Saved project declaration</p>
      {reference.code ? <><p><code>{reference.code}</code> · {reference.name}</p><p className="mt-1">Height reference: {reference.verticalDatum || 'Not declared'}</p></> : <p>Reference system not set</p>}
      {!reference.code && <p className="mt-2">Declare the project's reference before using coordinates for terrain or drawing.</p>}
    </section>
    <section aria-label="Device review notes" className="mb-6 text-sm leading-relaxed">
      <p className="font-medium tabular-nums">{reviewed.length} of {steps.length} review notes checked on this device</p>
      <p className="mt-1 text-[var(--text-secondary)]">Review notes do not establish computed results, field verification or approval. They apply to this project and its saved reference.</p>
      {storageError && <p role="alert" className="mt-3">{storageError}</p>}
    </section>
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const Icon = step.icon, isReviewed = reviewed.includes(step.id)
        const standalone = ['slope', 'volumes', 'sections'].includes(step.id)
        return <li key={step.id} className="flex items-start gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 md:gap-4">
          <button type="button" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            aria-label={`Mark ${step.title} as reviewed`} aria-pressed={isReviewed}
            onClick={() => saveNotes(isReviewed ? reviewed.filter(id => id !== step.id) : [...reviewed, step.id])}>
            {isReviewed ? <CheckCircle2 aria-hidden="true" className="h-6 w-6 text-[var(--accent)]" /> : <Circle aria-hidden="true" className="h-6 w-6 text-[var(--text-muted)]" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2"><Icon aria-hidden="true" className="h-4 w-4 text-[var(--text-muted)]" />
              <h2 className="text-sm font-semibold">{index + 1}. {step.title}</h2>
              {step.optional && <span className="text-xs text-[var(--text-muted)]">Optional</span>}
            </div>
            <p className="mb-2 text-sm leading-relaxed text-[var(--text-secondary)]">{step.description}</p>
            {standalone && <p className="mb-2 text-xs text-[var(--text-muted)]">Standalone tool: select and review its source data separately.</p>}
            <Link aria-label={`Open ${step.title}`} href={projectHref(step, projectId)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--accent)] underline underline-offset-4">Open tool <ArrowRight aria-hidden="true" className="h-3 w-3" /></Link>
          </div>
        </li>
      })}
    </ol>
    <div className="mt-6 flex justify-end"><button type="button" className={buttonClass} onClick={() => saveNotes([])}>Reset review notes</button></div>
  </>
}
