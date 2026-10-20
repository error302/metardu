'use client'

/**
 * ComputeStagePanel — In-place survey computation engine integration.
 *
 * Blueprint reference:
 *   §5.3 Compute — deterministic survey math, field-to-finish, misclosure evaluation
 *   §14.1 Assurance dimensions — computation and redundancy
 */

import React from 'react'
import { Calculator, ArrowRight, Compass, Ruler } from 'lucide-react'
import Link from 'next/link'
import CadastralComputeIntegration from '@/components/workspace/CadastralComputeIntegration'
import { FieldToFinishButton } from '@/components/workspace/FieldToFinishButton'

interface Props {
  projectId: string
  projectName: string
}

export default function ComputeStagePanel({ projectId, projectName: _projectName }: Props) {
  return (
    <div className="space-y-5">
      {/* 1-Click Field-to-Finish Banner */}
      <div className="p-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Deterministic Field-to-Finish
            </h3>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
            AUTONOMOUS ENGINE
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Runs Kenya Survey Regulations Bowditch traverse adjustment, closes boundary polygon, checks misclosure against statutory tolerance, computes coordinate schedule, and generates CAD boundaries in one deterministic pass.
        </p>
        <div className="pt-1">
          <FieldToFinishButton projectId={projectId} />
        </div>
      </div>

      {/* Manual Compute Runner */}
      <div className="space-y-3">
        <CadastralComputeIntegration projectId={projectId} />
      </div>

      {/* Advanced Engineering Math Surfaces */}
      <div className="pt-2 border-t border-[var(--border-color)]">
        <h4 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          Specialized Computation Engines
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <Link
            href="/tools/traverse"
            className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-orange-400" />
              <span>Bowditch & Transit Traverse</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </Link>

          <Link
            href="/tools/leveling"
            className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Ruler className="w-4 h-4 text-cyan-400" />
              <span>Rise & Fall Level Reduction</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </Link>

          <Link
            href="/tools/cogo"
            className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-400" />
              <span>COGO Intersections & Resections</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </Link>

          <Link
            href="/tools/area"
            className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-blue-400" />
              <span>Double Meridian Area & Hectares</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </Link>
        </div>
      </div>
    </div>
  )
}
