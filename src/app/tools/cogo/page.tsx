import { PageHeader } from '@/components/shared/PageHeader'
import COGOCalculator from '@/components/cogo/COGOCalculator'

export default function COGOPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="COGO Calculator"
        subtitle="Coordinate Geometry — Inverse, Polar, Intersection, Resection, Area, Join"
        reference="Survey Act Cap 299 | RDM 1.1 (2025)"
      />
      <COGOCalculator compact />
    </div>
  )
}
