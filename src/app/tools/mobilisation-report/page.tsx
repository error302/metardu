'use client';

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PrintMetaPanel, defaultPrintMeta, type PrintMeta } from '@/components/shared/PrintMetaPanel'
import { buildPrintDocument, openPrint } from '@/lib/print/buildPrintDocument'
import { MOBILISATION_SECTIONS } from '@/lib/standards/rdm11'

type SectionKey = 'introduction' | 'healthSafety' | 'personnel' | 'equipment' | 'calibration' | 'fieldForms' | 'miscellaneous'

const LABELS: Record<SectionKey, string> = {
  introduction: 'Introduction',
  healthSafety: 'Health and Safety Considerations',
  personnel: 'Personnel',
  equipment: 'Equipment',
  calibration: 'Calibration',
  fieldForms: 'Field Forms',
  miscellaneous: 'Miscellaneous',
}

const EMPTY_REPORT: Record<SectionKey, string> = {
  introduction: '',
  healthSafety: '',
  personnel: '',
  equipment: '',
  calibration: '',
  fieldForms: '',
  miscellaneous: '',
}

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

export default function MobilisationReportPage() {
  const [meta, setMeta] = useState<PrintMeta>(defaultPrintMeta)
  const [report, setReport] = useState<Record<SectionKey, string>>(EMPTY_REPORT)

  // loadDemo removed — PHASE13_DEMO_PROJECTS was removed
  const loadDemo = () => {}

  const handlePrint = () => {
    const body = `
      <h2>Mobilisation Report - RDM 1.1 Table 5.3</h2>
      <div class="summary-box">
        <div class="summary-row"><span class="summary-label">Required Sections</span><span class="summary-value">${MOBILISATION_SECTIONS.join(', ')}</span></div>
      </div>
      ${Object.entries(LABELS).map(([key, label], index) => `
        <h2>${index + 1}. ${label}</h2>
        <p>${esc(report[key as SectionKey] || '[To be completed]')}</p>
      `).join('')}
    `

    openPrint(buildPrintDocument(body, {
      title: 'Mobilisation Report',
      reference: 'RDM 1.1 (2025) Table 5.3 | Survey Regulations 1994 | SRVY2025-1',
      ...meta,
    }))
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Mobilisation Report"
        subtitle="Official mobilisation report template covering RDM 1.1 Table 5.3 sections before field deployment."
        reference="RDM 1.1 (2025) Table 5.3 | Survey Regulations 1994 | SRVY2025-1"
        badge="Table 5.3"
      />

      <div className="card mb-6">
        <div className="card-header flex items-center justify-between gap-4">
          <span className="label">Report Header</span>
          <button onClick={loadDemo} className="btn btn-secondary">Load Road Survey Demo</button>
        </div>
        <div className="p-4">
          <PrintMetaPanel meta={meta} onChange={setMeta} />
        </div>
      </div>

      <div className="grid gap-4">
        {(Object.keys(LABELS) as SectionKey[]).map(key => (
          <div className="card" key={key}>
            <div className="card-header">
              <span className="label">{LABELS[key]}</span>
            </div>
            <div className="p-4">
              <textarea
                className="input w-full min-h-[110px] text-sm"
                value={report[key]}
                onChange={e => setReport(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={`Enter ${LABELS[key].toLowerCase()} details`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={handlePrint} className="btn btn-primary">Print Mobilisation Report</button>
      </div>
    </div>
  )
}
