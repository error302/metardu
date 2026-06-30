'use client'
import { GCPOptimizerPanel } from '@/components/survey/GCPOptimizerPanel'
import { PageHeader } from '@/components/shared/PageHeader'

export default function GCPOptimizerPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <PageHeader title="GCP Optimizer" subtitle="Drone survey ground control point planning" reference="Geometric optimization | Pix4D / WebODM compatible" />
      <div className="mt-6"><GCPOptimizerPanel /></div>
    </div>
  )
}
