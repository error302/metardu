'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { buildPrintDocument, openPrint } from '@/lib/print/buildPrintDocument'
import { RDM_DETAIL_TOLERANCES } from '@/lib/standards/rdm11'

export default function DetailTolerancesPage() {
  const handlePrint = () => {
    const rows = RDM_DETAIL_TOLERANCES.map(t => `
      <tr>
        <td>${t.feature}</td>
        <td class="mono">${t.xy}</td>
        <td class="mono">${t.z}</td>
        <td>${t.fieldUse}</td>
      </tr>
    `).join('')

    openPrint(buildPrintDocument(`
      <h2>Detailed Survey Tolerances - RDM 1.1 Table 5.2</h2>
      <table>
        <tr>
          <th>Feature Class</th>
          <th>XY Tolerance</th>
          <th>Z Tolerance</th>
          <th>Field Application</th>
        </tr>
        ${rows}
      </table>
      <div class="summary-box">
        <div class="summary-row"><span class="summary-label">Use</span><span class="summary-value">Topographic and detailed engineering survey pickup</span></div>
        <div class="summary-row"><span class="summary-label">Reference</span><span class="summary-value">RDM 1.1 (2025) Table 5.2</span></div>
      </div>
    `, {
      title: 'Detailed Survey Tolerances',
      reference: 'RDM 1.1 (2025) Table 5.2 | Survey Regulations 1994',
    }))
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Detailed Survey Tolerances"
        subtitle="RDM 1.1 Table 5.2 field tolerance display for detailed topographic survey pickup."
        reference="RDM 1.1 (2025) Table 5.2 | Structures, pavements, and general topographic detail"
        badge="Table 5.2"
      />

      <div className="card">
        <div className="card-header flex items-center justify-between gap-4">
          <span className="label">Tolerance Schedule</span>
          <button onClick={handlePrint} className="btn btn-primary">Print Schedule</button>
        </div>
        <div className="overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Feature Class</th>
                <th>XY Tolerance</th>
                <th>Z Tolerance</th>
                <th>Field Application</th>
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
    </div>
  )
}
