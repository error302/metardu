'use client';

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect, useCallback } from 'react'
import ProjectWorkflowBadge from '@/components/shared/ProjectWorkflowBadge'

/* ── Delete Confirmation Modal ──────────────────────────────────────────── */
function DeleteConfirmModal({
  projectName,
  pointCount,
  parcelCount,
  onConfirm,
  onCancel,
  isDeleting,
  deleteError,
}: {
  projectName: string
  pointCount: number
  parcelCount: number
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
  deleteError: string
}) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div ref={modalRef}
        className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg w-full max-w-md shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with warning */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 border border-[var(--error)]/30 bg-[var(--error)]/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-[var(--error)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="font-display text-lg text-[var(--text-primary)] tracking-[-0.015em]">Delete project</h3>
              <p className="text-sm text-[var(--text-muted)]">This action cannot be undone</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-4">
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-md p-4 mb-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to permanently delete{' '}
              <span className="font-medium text-[var(--text-primary)]">"{projectName}"</span>?
            </p>
            {(pointCount > 0 || parcelCount > 0) && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)] space-y-1">
                {pointCount > 0 && (
                  <p className="text-xs text-[var(--error)] flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span><strong>{pointCount}</strong> survey point{pointCount > 1 ? 's' : ''} will be permanently deleted</span>
                  </p>
                )}
                {parcelCount > 0 && (
                  <p className="text-xs text-[var(--error)] flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span><strong>{parcelCount}</strong> parcel{parcelCount > 1 ? 's' : ''} will be permanently deleted</span>
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-[var(--text-muted)] mt-2">
              All associated data including points, parcels, alignments, chainage data, and submissions will be removed.
            </p>
          </div>

          {/* Error display */}
          {deleteError && (
            <div className="mb-4 p-3 rounded-md bg-[var(--error)]/10 border border-[var(--error)]/30 text-sm text-[var(--error)] flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.051 3.378c.866-1.5 3.032-1.5 3.898 0l7.354 13.122zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{deleteError}</span>
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-md border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-md bg-[var(--error)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Deleting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Yes, delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── ProjectCard ─────────────────────────────────────────────────────────── */
export default function ProjectCard({ project, openLabel }: { project: any; openLabel: string }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const getSurveyBadgeLabel = (type?: string): string => {
    switch ((type || '').toLowerCase()) {
      case 'road': return 'ROAD'
      case 'boundary': return 'BOUNDARY'
      case 'topographic': return 'TOPO'
      case 'control': return 'CONTROL'
      case 'hydrographic': return 'HYDRO'
      case 'mining': return 'MINING'
      case 'construction': return 'CONSTRUCTION'
      case 'leveling': return 'LEVELING'
      case 'drone': return 'DRONE'
      case 'gnss': return 'GNSS'
      default: return (type || 'TOPO').toUpperCase()
    }
  }

  const surveyType = getSurveyBadgeLabel(project.survey_type)

  const pointCount = project.point_count ?? project._pointCount ?? 0
  const parcelCount = project.parcel_count ?? project._parcelCount ?? 0

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCardClick = (e: React.MouseEvent) => {
    // Ignore clicks on any interactive element: menu, delete, links, buttons
    const target = e.target as HTMLElement
    if (
      target.closest('.menu-trigger') ||
      target.closest('.menu-dropdown') ||
      target.closest('.delete-trigger') ||
      target.closest('a') ||
      target.closest('button')
    ) return
    router.push(`/project/${project.id}`)
  }

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/project/${project.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to delete project')
        setIsDeleting(false)
      } else {
        setShowDeleteModal(false)
        // Force a full page reload to guarantee the deleted project disappears
        // router.refresh() alone is unreliable for Server Component data
        window.location.href = window.location.pathname
      }
    } catch (err: unknown) {
      setDeleteError((err as Error).message || 'Failed to delete project — check your connection and try again')
      setIsDeleting(false)
    }
  }, [project.id])

  const badgeColor = (() => {
    // v0.3: muted pastels per impeccable skill — one accent, muted backgrounds
    const type = project.survey_type?.toLowerCase() || 'topo'
    if (type === 'road') return 'bg-[var(--primary-blue)]/15 text-[var(--primary-blue)]'
    if (type === 'boundary') return 'bg-[var(--success)]/15 text-[var(--success)]'
    if (type === 'control') return 'bg-[var(--accent)]/15 text-[var(--accent)]'
    if (type === 'topographic') return 'bg-[var(--warning)]/15 text-[var(--warning)]'
    return 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
  })()

  return (
    <>
      <div
        onClick={handleCardClick}
        className="group block rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5 hover:border-[var(--border-hover)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-all cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-display text-lg text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors leading-tight flex-1 truncate tracking-[-0.015em]">
            {project.name}
          </h3>
          <span className={`badge shrink-0 text-[9px] tracking-[0.08em] uppercase ${badgeColor}`}>{surveyType}</span>
        </div>

        <p className="text-sm text-[var(--text-muted)] mb-3 truncate font-mono">
          {project.location || 'No location set'}
        </p>

        {/* Workflow badge */}
        <div className="mb-4">
          <ProjectWorkflowBadge project={project} />
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs mb-4 border-t border-[var(--border-color)] pt-3">
          <div>
            <div className="font-mono text-[9px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Points</div>
            <div className="font-mono text-[var(--text-primary)]">{pointCount}</div>
          </div>
          <div>
            <div className="font-mono text-[9px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Parcels</div>
            <div className="font-mono text-[var(--text-primary)]">{parcelCount}</div>
          </div>
          <div>
            <div className="font-mono text-[9px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">UTM</div>
            <div className="font-mono text-[var(--text-primary)]">{project.utm_zone}{project.hemisphere}</div>
          </div>
        </div>

        <div className="text-[11px] text-[var(--text-muted)] mb-4 font-mono">
          {new Date(project.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>

        <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
          <Link
            href={`/project/${project.id}`}
            prefetch={false}
            onClick={e => e.stopPropagation()}
            className="text-xs text-[var(--accent)] font-medium hover:opacity-80 transition-opacity no-underline font-mono tracking-[0.04em] uppercase"
          >
            {openLabel} →
          </Link>

          <div className="flex items-center gap-1 relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setMenuOpen(false)
                setShowDeleteModal(true)
              }}
              className="delete-trigger w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--error)]/10 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
              title="Delete project"
              aria-label="Delete project"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setMenuOpen(!menuOpen)
              }}
              className="menu-trigger w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="More options"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
              </svg>
            </button>

            {menuOpen && (
              <div className="menu-dropdown absolute right-0 top-full mt-1 z-50 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1 min-w-[160px]">
                <Link
                  href={`/project/${project.id}`}
                  prefetch={false}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
                  className="block px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors no-underline"
                >
                  Open
                </Link>
                <Link
                  href={`/project/${project.id}/generate-plan`}
                  prefetch={false}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
                  className="block px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors no-underline"
                >
                  Generate plan
                </Link>
                <Link
                  href={`/project/${project.id}/documents`}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
                  className="block px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors no-underline"
                >
                  Generate report
                </Link>
                <div className="border-t border-[var(--border-color)] my-1"></div>
                <Link
                  href={`/project/${project.id}/contours`}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
                  className="block px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors no-underline"
                >
                  Contours
                </Link>
                <Link
                  href={`/project/${project.id}/profiles`}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
                  className="block px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors no-underline"
                >
                  Profiles
                </Link>
                <div className="border-t border-[var(--border-color)] my-1"></div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    setShowDeleteModal(true)
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <DeleteConfirmModal
          projectName={project.name}
          pointCount={pointCount}
          parcelCount={parcelCount}
          onConfirm={handleDelete}
          onCancel={() => { setShowDeleteModal(false); setDeleteError('') }}
          isDeleting={isDeleting}
          deleteError={deleteError}
        />
      )}
    </>
  )
}
