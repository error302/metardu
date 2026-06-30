'use client'
import { CutFillPanel } from '@/components/engineering/CutFillPanel'
import { PageHeader } from '@/components/shared/PageHeader'

export default function CutFillPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <PageHeader title="Cut & Fill Engine" subtitle="Earthwork volume calculation with heat map" reference="Grid method | Infrastructure surveys" />
      <div className="mt-6"><CutFillPanel /></div>
    </div>
  )
}
