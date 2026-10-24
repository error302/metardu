'use client'

/**
 * DeliverStagePanel — Statutory deliverable generation, exports, and submission packages.
 *
 * Blueprint reference:
 *   §5.6 Deliver — deliverables, deed plans, statutory workbooks, multi-format exports
 *   §15 Deliverable system
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Package, FileText, Download, FileCode, Layers, ExternalLink, Printer, History } from 'lucide-react'
import Link from 'next/link'
import FormC22Generator from '@/components/workspace/FormC22Generator'

const registerResponseSchema = z.object({ data: z.object({ deliverables: z.array(z.object({
  id: z.string().min(1), project_id: z.string().min(1), document_type: z.string().min(1),
  title: z.string().nullable(), source_revision: z.string().nullable(),
  current_revision: z.number().int().positive(),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'VOID']),
})) }) })
type RegisterItem = z.infer<typeof registerResponseSchema>['data']['deliverables'][number]

interface Props {
  projectId: string
  projectName: string
}

export default function DeliverStagePanel({ projectId, projectName }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [register, setRegister] = useState<{ projectId: string; items: RegisterItem[] } | null>(null)
  const [readError, setReadError] = useState<{ projectId: string; message: string } | null>(null)
  const [loadingProject, setLoadingProject] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const activeProjectRef = useRef(projectId)
  activeProjectRef.current = projectId
  const hasLoaded = register?.projectId === projectId
  const deliverables = hasLoaded ? register.items : []
  const registerError = readError?.projectId === projectId ? readError.message : null
  const loadingRegister = loadingProject === projectId
  const approvalKnown = hasLoaded && !registerError
  const hasApprovedPlan = approvalKnown && deliverables.some(item => item.document_type === 'deed_plan' && item.status === 'APPROVED')

  /**
   * The document register (blueprint §15). Every export issued from this stage
   * is recorded with its source revision, revision number and content hash, so
   * the panel can show what has actually been issued instead of assuming a
   * download produced a deliverable.
   */
  const fetchRegister = useCallback(async () => {
    if (activeProjectRef.current !== projectId) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    try {
      setLoadingProject(projectId)
      const res = await fetch(`/api/project/${projectId}/deliverables`, { signal: controller.signal })
      if (!res.ok) throw new Error('Deliverable register unavailable')
      const json = registerResponseSchema.parse(await res.json())
      if (json.data.deliverables.some(item => item.project_id !== projectId)) throw new Error('Register belongs to another project')
      if (controller.signal.aborted) return
      setRegister({ projectId, items: json.data.deliverables })
      setReadError(null)
    } catch {
      if (!controller.signal.aborted) setReadError({ projectId, message: 'Document register could not be loaded. Approval status is not confirmed. Try again; your saved records have not changed.' })
    } finally {
      if (!controller.signal.aborted) setLoadingProject(null)
    }
  }, [projectId])

  useEffect(() => {
    fetchRegister()
    return () => { requestRef.current?.abort() }
  }, [fetchRegister])

  const handleExport = async (format: 'dxf' | 'geojson' | 'csv' | 'landxml') => {
    try {
      setDownloading(format)
      const res = await fetch(`/api/project/${projectId}/export?format=${format}`)
      if (!res.ok) throw new Error(`Export failed for format ${format}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName.toLowerCase().replace(/\s+/g, '_')}.${format === 'landxml' ? 'xml' : format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      // The server registered this revision; show what is now on record.
      await fetchRegister()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Document register (blueprint §15): what has actually been issued */}
      <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Document register
            </h3>
          </div>
          <button
            onClick={fetchRegister}
            aria-label="Refresh document register"
            disabled={loadingRegister}
            className="text-[11px] text-[var(--text-muted)] hover:text-white underline"
          >
            Refresh
          </button>
        </div>
        {registerError && <div role="alert" className="space-y-2 text-xs text-amber-400">
          <p>{registerError}</p>
          {hasLoaded && <p>Showing the last loaded records below.</p>}
          <button onClick={fetchRegister} disabled={loadingRegister} className="text-[var(--accent)] underline disabled:opacity-50">Retry document register</button>
        </div>}
        {loadingRegister && !hasLoaded ? <p role="status" className="text-xs text-[var(--text-muted)]">Loading document register…</p>
        : !hasLoaded ? null : deliverables.length === 0 ? (!registerError && (
          <p className="text-[11px] text-[var(--text-muted)]">
            Nothing issued yet. Exports below are recorded here with their revision, source data
            revision and content hash.
          </p>
        )) : (
          <ul className="divide-y divide-[var(--border-color)] text-[11px]">
            {deliverables.map((d) => (
              <li key={d.id} className="py-1.5 flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0 break-words text-[var(--text-primary)]">
                  {d.title ?? d.document_type}
                  {d.source_revision ? ` · ${d.source_revision}` : ''}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[var(--text-muted)]">R{d.current_revision}</span>
                  <span
                    className={`px-1.5 rounded-full border ${
                      d.status === 'APPROVED'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : d.status === 'IN_REVIEW'
                          ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-[var(--border-color)]'
                    }`}
                  >
                    {d.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Official Kenya Deed Plan Form No. 4 */}
      <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Kenya Deed Plan (Form No. 4)
            </h3>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      hasApprovedPlan
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            }`}
          >
            {!approvalKnown ? 'APPROVAL NOT CONFIRMED' : hasApprovedPlan
              ? 'APPROVED PLAN ON RECORD'
              : 'NOT YET APPROVED'}
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Prepare a draft deed-plan sheet with a title block, coordinate schedule and beacon references. Confirm the project reference, scale and required evidence before professional review.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            href={`/deed-plan?projectId=${projectId}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-xs font-semibold hover:bg-[var(--accent-dim)] transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Generate Deed Plan
          </Link>
          <Link
            href={`/tools/survey-plan-demo?projectId=${projectId}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:text-white hover:bg-white/5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Preview Sheet Composer
          </Link>
        </div>
      </div>

      {/* Form C.22 Generator */}
      <div className="space-y-2">
        <FormC22Generator projectId={projectId} />
      </div>

      {/* Multi-Format Engineering Exports */}
      <div className="space-y-3">
        <h4 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Project Data Exports
        </h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            onClick={() => handleExport('dxf')}
            disabled={downloading !== null}
            className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-orange-400" />
              <span className="font-semibold text-[var(--text-primary)]">AutoCAD DXF</span>
            </div>
            <Download className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>

          <button
            onClick={() => handleExport('landxml')}
            disabled={downloading !== null}
            className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-[var(--text-primary)]">LandXML 1.2</span>
            </div>
            <Download className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>

          <button
            onClick={() => handleExport('geojson')}
            disabled={downloading !== null}
            className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-[var(--text-primary)]">GeoJSON</span>
            </div>
            <Download className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>

          <button
            onClick={() => handleExport('csv')}
            disabled={downloading !== null}
            className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-[var(--text-primary)]">Coordinates CSV</span>
            </div>
            <Download className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
        </div>
      </div>

      {/* Statutory Submission Package */}
      <div className="pt-2 border-t border-[var(--border-color)]">
        <h4 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          Manual Submission Package
        </h4>
        <div className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Statutory Submission Package (ZIP)
            </span>
            <p className="text-[11px] text-[var(--text-muted)]">
              Assembles available plans, forms, traverse history, computation sheets, and audit evidence for surveyor review. METARDU does not upload this package to a registry; confirm the current official requirements before filing.
            </p>
          </div>
          <Link
            href={`/tools/statutory-workbook?projectId=${projectId}`}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap ml-3"
          >
            Assemble Package
          </Link>
        </div>
      </div>
    </div>
  )
}
