'use client'

import { SectionalPlanEditor } from '@/components/survey/SectionalPlanEditor'
import { PageHeader } from '@/components/shared/PageHeader'

export default function SectionalPropertiesPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <PageHeader
        title="Sectional Properties"
        subtitle="3D Cadastre — Sectional Properties Act 2012"
        reference="Sectional Properties Act, 2012 | Survey Act Cap 299"
      />
      <div className="mt-6">
        <SectionalPlanEditor />
      </div>
    </div>
  )
}
