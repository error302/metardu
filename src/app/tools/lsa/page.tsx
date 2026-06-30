'use client'
import { PageHeader } from '@/components/shared/PageHeader'

export default function LeastSquaresPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <PageHeader title="Least Squares Adjustment" subtitle="Parametric adjustment for high-precision control networks" reference="Ghilani & Wolf | Chi-square testing | Error ellipses" />
      <div className="mt-6">
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500">
            The LSA engine is available at <code className="font-mono text-[var(--accent)]">src/lib/engine/leastSquaresAdjustment.ts</code>.
            Import observations (angles + distances with standard deviations) and call <code className="font-mono text-[var(--accent)]">adjustTraverseLSA()</code>.
          </p>
          <p className="text-xs text-gray-600 mt-2">
            Outputs: adjusted coordinates, corrections, standard errors, error ellipses, residuals, chi-square test.
          </p>
        </div>
      </div>
    </div>
  )
}
