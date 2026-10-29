'use client'

import Link from 'next/link'
import { Crosshair, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import type { StageReference } from '@/lib/workspaces/stageReference'
import {
  STAGES,
  getStageDefinition,
  stageHref,
  stageToolHrefs,
  type StageId,
} from '@/lib/workspaces/stageRegistry'
import EnhancedSplitLayout from '@/components/workspace/EnhancedSplitLayout'
import WorkspaceMap from '@/components/workspace/WorkspaceMap'
import ComputationLog from '@/components/workspace/ComputationLog'
import ControlStagePanel from '@/components/workspace/stages/ControlStagePanel'
import ObserveStagePanel from '@/components/workspace/stages/ObserveStagePanel'
import ComputeStagePanel from '@/components/workspace/stages/ComputeStagePanel'
import DesignStagePanel from '@/components/workspace/stages/DesignStagePanel'
import VerifyStagePanel from '@/components/workspace/stages/VerifyStagePanel'
import DeliverStagePanel from '@/components/workspace/stages/DeliverStagePanel'

interface StageStation {
  pointName?: string
  adjustedEasting?: number
  adjustedNorthing?: number
  easting?: number
  northing?: number
  E?: number
  N?: number
  e?: number
  n?: number
}

export interface StageBoundaryData {
  adjustedStations?: StageStation[] | null
  stations?: StageStation[]
}

export interface StageSummary {
  pointCount: number
  observationBatchCount: number
  parcelCount: number
  evidenceEventCount: number
  lastEvidenceDate: string | null
}

interface StageShellProps {
  projectId: string
  projectName: string
  stageId: StageId
  boundaryData?: StageBoundaryData | null
  reference: StageReference
  summary?: StageSummary | null
}

export default function StageShell({
  projectId,
  projectName,
  stageId,
  boundaryData,
  reference,
  summary,
}: StageShellProps) {
  const stage = getStageDefinition(stageId)
  const stageIndex = STAGES.findIndex((s) => s.id === stageId)
  const prevStage = stageIndex > 0 ? STAGES[stageIndex - 1] : null
  const nextStage =
    stageIndex < STAGES.length - 1 ? STAGES[stageIndex + 1] : null
  const toolLinks = stageToolHrefs(stage, projectId)
  const epsg = reference.code

  const leftPanel = (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      <header className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)] mb-2">
          {projectName} <span className="text-[var(--text-muted)]">/ Stage {stageIndex + 1} of {STAGES.length}</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {stage.label}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--text-muted)] mt-2 max-w-2xl">
          {stage.purpose}
        </p>
      </header>

      <section className="mb-5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4" aria-label="Project reference system">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Project reference system</p>
            <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{reference.name}{epsg ? ` · ${epsg}` : ''}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              {reference.source === 'declared'
                ? `${reference.distanceMode === 'ground' ? 'Ground' : 'Grid'} distances · Height reference: ${reference.verticalDatum ?? 'not declared'}`
                : reference.source === 'legacy'
                  ? 'Read from legacy project settings. Confirm the complete reference system before professional output.'
                  : 'Declare a projected reference system before plotting project coordinates or adding control.'}
            </p>
          </div>
          {reference.source !== 'declared' && (
            <Link href={`/project/${projectId}/settings`} className="shrink-0 text-xs font-semibold text-[var(--accent)] hover:underline">
              Set CRS
            </Link>
          )}
        </div>
      </section>

      <details className="mb-5 text-xs text-[var(--text-muted)]">
        <summary className="cursor-pointer font-medium hover:text-[var(--text-secondary)]">What this stage covers</summary>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {stage.scope.map((item) => (
            <span key={item} className="px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">{item}</span>
          ))}
        </div>
      </details>

      {stageId === 'overview' ? (
        <section className="mb-6" aria-label="Project record summary">
          <div className="mb-5 flex flex-wrap gap-3"><Link href={`/schedule?new=1&projectId=${encodeURIComponent(projectId)}`} className="btn btn-secondary min-h-11">Schedule survey</Link><Link href={`/field/collect?projectId=${encodeURIComponent(projectId)}`} className="btn btn-primary min-h-11">Collect field points</Link></div>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Project records</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Recorded entries are shown here; counts do not imply review or approval.</p>
            </div>
            {summary?.lastEvidenceDate && <span className="shrink-0 text-[11px] text-[var(--text-muted)]">Latest evidence · {summary.lastEvidenceDate}</span>}
          </div>
          {summary ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Survey points', value: summary.pointCount },
                { label: 'Observation batches', value: summary.observationBatchCount },
                { label: 'Parcels', value: summary.parcelCount },
                { label: 'Evidence events', value: summary.evidenceEventCount },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
                  <p className="font-mono text-xl font-semibold tabular-nums text-[var(--text-primary)]">{item.value.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">{item.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 text-xs text-[var(--text-muted)]">Project record counts are unavailable right now.</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] px-4 py-3">
            <p className="text-xs text-[var(--text-secondary)]">Confirm the reference system and control before processing observations.</p>
            <Link href={`/project/${projectId}/control`} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline">
              Open control <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      ) : (
        <section className="mb-6 p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]" aria-label="Interactive workspace stage">
          {stageId === 'control' && (epsg
            ? <ControlStagePanel projectId={projectId} epsg={epsg} />
            : <p className="text-sm text-[var(--text-muted)]">Set the project CRS before recording control coordinates.</p>)}
          {stageId === 'observe' && <ObserveStagePanel projectId={projectId} />}
          {stageId === 'compute' && <ComputeStagePanel projectId={projectId} projectName={projectName} />}
          {stageId === 'design' && (
            <DesignStagePanel projectId={projectId} projectName={projectName} boundaryData={boundaryData} epsg={epsg ?? undefined} />
          )}
          {stageId === 'verify' && (
            <VerifyStagePanel projectId={projectId} projectName={projectName} boundaryData={boundaryData} />
          )}
          {stageId === 'deliver' && <DeliverStagePanel projectId={projectId} projectName={projectName} />}
        </section>
      )}

      <section className="mb-6" aria-label="Relevant tools">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
          Relevant tools
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {toolLinks.map((tool) => (
            <Link
              key={tool.href + tool.label}
              href={tool.href}
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] transition-colors min-h-[40px]"
            >
              <span>{tool.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </Link>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border-color)]">
        {prevStage ? (
          <Link
            href={stageHref(projectId, prevStage)}
            className="flex items-center gap-1 px-3 py-2 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors min-h-[36px]"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {prevStage.label}
          </Link>
        ) : (
          <span />
        )}
        {nextStage ? (
          <Link
            href={stageHref(projectId, nextStage)}
            className="flex items-center gap-1 px-3 py-2 rounded text-xs font-medium text-black bg-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors min-h-[36px]"
          >
            {nextStage.label}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  )

  const rightPanel = epsg ? (
    <WorkspaceMap
      projectId={projectId}
      projectName={projectName}
      boundaryData={boundaryData ?? null}
      epsg={epsg}
    />
  ) : (
    <div className="flex h-full items-center justify-center bg-[var(--bg-tertiary)] px-6 text-center">
      <div className="max-w-xs">
        <Crosshair className="mx-auto mb-3 h-6 w-6 text-[var(--text-muted)]" />
        <p className="text-sm font-medium text-[var(--text-primary)]">Map awaiting project CRS</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">Project coordinates cannot be placed on a basemap without their reference system.</p>
        <Link href={`/project/${projectId}/settings`} className="mt-3 inline-block text-xs font-semibold text-[var(--accent)] hover:underline">Open reference settings</Link>
      </div>
    </div>
  )

  return (
    <EnhancedSplitLayout
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      logPanel={<ComputationLog />}
      statusBarEntries={[
        { label: 'Stage', value: stage.label, status: 'idle' },
        { label: 'CRS', value: epsg ?? 'Not set', status: epsg ? 'idle' : 'warning' },
        { label: 'Basis', value: reference.source === 'declared' ? 'Declared' : reference.source === 'legacy' ? 'Legacy' : 'Missing', status: reference.source === 'declared' ? 'idle' : 'warning' },
      ]}
    />
  )
}
