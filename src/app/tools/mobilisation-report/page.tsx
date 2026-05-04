'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PrintMetaPanel, defaultPrintMeta, type PrintMeta } from '@/components/shared/PrintMetaPanel'
import { buildPrintDocument, openPrint } from '@/lib/print/buildPrintDocument'
import { MOBILISATION_SECTIONS, PHASE13_DEMO_PROJECTS } from '@/lib/standards/rdm11'

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

  const loadDemo = () => {
    const demo = PHASE13_DEMO_PROJECTS.topographicRoad
    setMeta({
      ...defaultPrintMeta,
      projectName: demo.projectName,
      clientName: demo.clientName,
      surveyorName: demo.surveyorName,
      regNo: demo.regNo,
      iskNo: demo.iskNo,
      instrument: demo.instrument,
      submissionNo: demo.submissionNo,
      weather: 'Clear, light wind, good visibility',
      observer: 'Brian M. Kariuki',
    })
    setReport({
      introduction: 'Mobilisation for a detailed topographic and control survey along the Kangundo Road junction improvement corridor. The survey supports road design, drainage review, utility coordination, and construction control.',
      healthSafety: 'Daily toolbox talk, traffic spotter on active carriageway, reflective PPE, cone taper at instrument setups, first-aid kit in survey vehicle, and no solo work near open drains or live traffic.',
      personnel: 'Registered Surveyor: Eng. Amina W. Njoroge (RS149). Instrument Operator: Brian M. Kariuki. Recorder/Chainperson: Mercy N. Wambui. Driver/Safety Assistant: Peter O. Otieno.',
      equipment: 'Leica TS16 I 1" robotic total station, Leica LS15 digital level, Leica GS18 T GNSS rover, two prisms, 5 m staff, tripods, tribrachs, radios, field tablets, and control-mark recovery kit.',
      calibration: 'Total station calibration certificate CAL/TS/2026/041 dated 18 Mar 2026. Digital level certificate CAL/DL/2026/044 dated 20 Mar 2026. GNSS receiver check CAL/GNSS/2026/038 dated 16 Mar 2026.',
      fieldForms: 'Traverse field book, level book, control marks register, detail pickup coding sheet, site hazard checklist, and daily equipment check form.',
      miscellaneous: 'Client to provide access letters for frontage plots. Utility covers to be lifted only with client approval. Control marks to be witnessed with photos before demobilisation.',
    })
  }

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
