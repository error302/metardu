'use client'

import CrossSectionInput from '@/components/earthworks/CrossSectionInput'
import { RDM_DETAIL_TOLERANCES } from '@/lib/standards/rdm11'

export default function CrossSectionsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Cross Sections</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Cross section analysis for earthworks and volume calculations | End Area Method | Prismoidal Formula | RDM 1.1 (2025)
      </p>
      <div className="mb-6 card">
        <div className="card-header">
          <span className="label">RDM 1.1 Table 5.2 Detail Pickup Tolerances</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table min-w-[680px]">
            <thead>
              <tr>
                <th>Feature Class</th>
                <th>XY</th>
                <th>Z</th>
                <th>Use in Cross Sections</th>
              </tr>
            </thead>
            <tbody>
              {RDM_DETAIL_TOLERANCES.map(t => (
                <tr key={t.feature}>
                  <td className="font-medium">{t.feature}</td>
                  <td className="font-mono">{t.xy}</td>
                  <td className="font-mono">{t.z}</td>
                  <td className="text-sm text-[var(--text-muted)]">{t.fieldUse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CrossSectionInput />
    </div>
  )
}
