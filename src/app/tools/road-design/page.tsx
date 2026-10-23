'use client';

import { useState } from 'react'
import HorizontalCurveCalculator from '@/components/road-design/HorizontalCurveCalculator'
import { PageHeader } from '@/components/shared/PageHeader'
import VerticalCurveCalculator from '@/components/road-design/VerticalCurveCalculator'
import SuperelevationCalculator from '@/components/road-design/SuperelevationCalculator'
import SightDistanceChecker from '@/components/road-design/SightDistanceChecker'
import { useLanguage } from '@/lib/i18n/LanguageContext'

type Tab = 'horizontal' | 'vertical' | 'superelevation' | 'sight'

const TABS: Array<{ id: Tab; label: string; desc: string }> = [
  { id: 'horizontal', label: 'Horizontal Curve', desc: 'T, L, C, M, E, D — TC/CC/CT chainages — set-out table' },
  { id: 'vertical', label: 'Vertical Curve', desc: 'BVC/EVC chainages+RLs, RL at any point, peak/sag point' },
  { id: 'superelevation', label: 'Superelevation', desc: 'Banking and crossfall rotation against declared project criteria' },
  { id: 'sight', label: 'Sight Distance', desc: 'Available SSD, PSD and radius comparisons against declared criteria' },
]

export default function RoadDesignPage() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('horizontal')

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.roadDesign')}
        subtitle={t('tools.roadDesignDesc')}
      />

      <div className="flex gap-1 border-b border-[var(--border-color)] mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t border-b-2 transition-all ${tab === t.id ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-w-0 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4 sm:p-6">
        {tab === 'horizontal' && (
          <>
            <h2 className="text-lg font-semibold mb-1">Horizontal Curve Elements &amp; Set-Out</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">Simple circular curve geometry. <a href="https://wsdot.wa.gov/publications/manuals/fulltext/m22-97/chapter11.pdf" className="underline">Formula reference: WSDOT Highway Surveying Manual, Chapter 11</a>. Project design standards and field acceptance require separate review.</p>
            <HorizontalCurveCalculator />
          </>
        )}
        {tab === 'vertical' && (
          <>
            <h2 className="text-lg font-semibold mb-1">Vertical Curve Design</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">Symmetrical parabolic geometry. <a href="https://help.trimble.com/doc/novapoint/novapoint/road/road-cad-tools/alignment-design/technical-information/supplementary-information" className="underline">Reference: Trimble Novapoint K-value concept</a>. Design-standard compliance requires separate review.</p>
            <VerticalCurveCalculator />
          </>
        )}
        {tab === 'superelevation' && (
          <>
            <h2 className="text-lg font-semibold mb-1">Superelevation Design</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">Enter the adopted side friction, banking limit and relative gradient with their project reference.</p>
            <SuperelevationCalculator />
          </>
        )}
        {tab === 'sight' && (
          <>
            <h2 className="text-lg font-semibold mb-1">Sight Distance &amp; Radius Comparisons</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">Use the criteria adopted for the project. <a className="underline" href="https://kura.go.ke/wp-content/uploads/2025/06/RDM-1.3-Geometric-Design-of-Highways-Rural-Roads-and-Urban-Roads.pdf">Reference library: Kenya RDM 1.3 (2025)</a>. This reference is not automatically adopted or certified.</p>
            <SightDistanceChecker />
          </>
        )}
      </div>
    </div>
  )
}
