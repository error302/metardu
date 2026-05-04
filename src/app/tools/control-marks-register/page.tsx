'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PrintMetaPanel, defaultPrintMeta, type PrintMeta } from '@/components/shared/PrintMetaPanel'
import { buildPrintDocument, openPrint } from '@/lib/print/buildPrintDocument'
import { CONTROL_MARK_REGISTER_COLUMNS, PHASE13_DEMO_PROJECTS } from '@/lib/standards/rdm11'

interface MarkRow {
  id: string
  type: string
  order: string
  easting: string
  northing: string
  elevation: string
  description: string
  condition: string
  photoRef: string
  witnessNotes: string
}

const blankRow = (): MarkRow => ({
  id: '',
  type: 'Concrete Pillar',
  order: 'SECONDARY',
  easting: '',
  northing: '',
  elevation: '',
  description: '',
  condition: 'FOUND GOOD',
  photoRef: '',
  witnessNotes: '',
})

const FIELD_WIDTHS: Record<keyof MarkRow, string> = {
  id: 'min-w-[120px]',
  type: 'min-w-[170px]',
  order: 'min-w-[140px]',
  easting: 'min-w-[150px]',
  northing: 'min-w-[160px]',
  elevation: 'min-w-[140px]',
  description: 'min-w-[320px]',
  condition: 'min-w-[150px]',
  photoRef: 'min-w-[160px]',
  witnessNotes: 'min-w-[360px]',
}

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function ControlMarksRegisterPage() {
  const [meta, setMeta] = useState<PrintMeta>(defaultPrintMeta)
  const [rows, setRows] = useState<MarkRow[]>([blankRow()])

  const updateRow = (index: number, field: keyof MarkRow, value: string) => {
    setRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  const loadDemo = () => {
    const demo = PHASE13_DEMO_PROJECTS.engineeringControl
    setMeta({
      ...defaultPrintMeta,
      projectName: demo.projectName,
      clientName: demo.clientName,
      surveyorName: demo.surveyorName,
      regNo: demo.regNo,
      iskNo: demo.iskNo,
      instrument: demo.instrument,
      submissionNo: demo.submissionNo,
      observer: 'Joseph M. Ndegwa',
      weather: 'Dry, clear, stable visibility',
    })
    setRows([
      { id: 'CP01', type: 'Concrete Pillar', order: 'PRIMARY', easting: '275421.384', northing: '9854621.226', elevation: '1538.426', description: '20 mm brass pin in concrete pillar near gate house', condition: 'FOUND GOOD', photoRef: 'CP01-IMG-001', witnessNotes: '1.20 m east of fence corner, 8.40 m south of gate centreline' },
      { id: 'CP02', type: 'Nail and washer', order: 'SECONDARY', easting: '275812.067', northing: '9854388.914', elevation: '1536.882', description: 'Survey nail in concrete kerb at warehouse access', condition: 'SET', photoRef: 'CP02-IMG-002', witnessNotes: '0.35 m behind kerb face, 14.10 m from power pole AP-17' },
      { id: 'BM03', type: 'Benchmark', order: 'SECONDARY', easting: '275604.743', northing: '9854112.650', elevation: '1534.218', description: 'Chiselled square on culvert headwall', condition: 'FOUND GOOD', photoRef: 'BM03-IMG-003', witnessNotes: 'North headwall of 900 mm culvert, left side of access road' },
    ])
  }

  const handlePrint = () => {
    const bodyRows = rows.map(row => `
      <tr>
        <td class="mono bold">${esc(row.id)}</td>
        <td>${esc(row.type)}</td>
        <td>${esc(row.order)}</td>
        <td class="right mono">${esc(row.easting)}</td>
        <td class="right mono">${esc(row.northing)}</td>
        <td class="right mono">${esc(row.elevation)}</td>
        <td>${esc(row.description)}</td>
        <td>${esc(row.condition)}</td>
        <td class="mono">${esc(row.photoRef)}</td>
        <td>${esc(row.witnessNotes)}</td>
      </tr>
    `).join('')

    openPrint(buildPrintDocument(`
      <h2>Survey Control Marks Register</h2>
      <table>
        <tr>${CONTROL_MARK_REGISTER_COLUMNS.map(c => `<th>${c}</th>`).join('')}</tr>
        ${bodyRows}
      </table>
      <div class="summary-box">
        <div class="summary-row"><span class="summary-label">Total Marks</span><span class="summary-value">${rows.length}</span></div>
        <div class="summary-row"><span class="summary-label">Reference</span><span class="summary-value">RDM 1.1 Section 5.6.3 | Survey Regulations 1994</span></div>
      </div>
    `, {
      title: 'Survey Control Marks Register',
      reference: 'RDM 1.1 (2025) Section 5.6.3 | Survey Regulations 1994 | Survey Act Cap 299',
      ...meta,
    }))
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Survey Control Marks Register"
        subtitle="Control mark register with coordinates, condition, descriptions, and recovery notes for formal survey submissions."
        reference="RDM 1.1 (2025) Section 5.6.3 | Survey Regulations 1994 | Survey Act Cap 299"
        badge="RDM 5.6.3"
      />

      <div className="card mb-6">
        <div className="card-header flex items-center justify-between gap-4">
          <span className="label">Register Header</span>
          <button onClick={loadDemo} className="btn btn-secondary">Load Engineering Control Demo</button>
        </div>
        <div className="p-4">
          <PrintMetaPanel meta={meta} onChange={setMeta} />
        </div>
      </div>

      <div className="card">
        <div className="card-header flex items-center justify-between gap-4">
          <span className="label">Control Marks</span>
          <button onClick={() => setRows(prev => [...prev, blankRow()])} className="btn btn-secondary">Add Mark</button>
        </div>
        <div className="overflow-x-auto">
          <table className="table min-w-[2130px]">
            <thead>
              <tr>
                {CONTROL_MARK_REGISTER_COLUMNS.map(column => <th key={column}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {(Object.keys(row) as (keyof MarkRow)[]).map(field => (
                    <td key={field}>
                      <input
                        className={`input ${FIELD_WIDTHS[field]} text-xs`}
                        value={row[field]}
                        onChange={e => updateRow(index, field, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={handlePrint} className="btn btn-primary">Print Control Marks Register</button>
      </div>
    </div>
  )
}
