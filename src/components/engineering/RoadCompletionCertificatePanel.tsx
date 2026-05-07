'use client'

import React, { useState } from 'react'
import { generateCertificate, CERTIFICATION_ITEMS, generateDefectSchedule } from '@/lib/generators/roadCompletionCertificate'
import type { RoadCompletionData, DefectItem } from '@/lib/generators/roadCompletionCertificate'

interface RoadCompletionCertificatePanelProps {
  projectId?: string
  roadClass?: string
  surveyorName?: string
  surveyorRegistration?: string
  surveyorFirm?: string
}

export default function RoadCompletionCertificatePanel({
  roadClass = 'B', surveyorName = '', surveyorRegistration = '', surveyorFirm = '',
}: RoadCompletionCertificatePanelProps) {
  const [data, setData] = useState<RoadCompletionData>({
    projectName: '', roadName: '', roadClass, roadNumber: '',
    chainageStart: 0, chainageEnd: 1000, totalLength: 1000,
    county: '', subCounty: '',
    designSpeed: 80, carriagewayWidth: 7.0, shoulderWidth: 2.0, designStandard: 'KRDM2017',
    contractorName: '', clientName: 'KeNHA', completionDate: new Date().toISOString().split('T')[0],
    surveyorName, surveyorRegistration, surveyorFirm,
    asBuiltPassRate: 98.5, asBuiltTotalPoints: 150, asBuiltPassPoints: 148, maxDeviation: 18.2, rmsError: 8.4,
    pavementLayers: [],
    earthworksCertified: true, pavementCertified: true, drainageCertified: false,
    signageCertified: true, roadFurnitureCertified: false,
    defectsNoted: [], reservations: [],
  })
  const [certificate, setCertificate] = useState<ReturnType<typeof generateCertificate> | null>(null)
  const [defects, setDefects] = useState<DefectItem[]>([])
  const [showPreview, setShowPreview] = useState(false)

  const update = (field: keyof RoadCompletionData, value: any) => setData({ ...data, [field]: value })

  const handleGenerate = () => {
    const cert = generateCertificate(data)
    setCertificate(cert)
    setShowPreview(true)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900">Road Completion Certificate</h3>
        <p className="text-sm text-gray-500 mt-1">Kenya Roads Act — formal certification of road construction completion</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4">
          {/* Project Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 text-sm mb-3">Project Details</h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'projectName', label: 'Project Name' },
                { key: 'roadName', label: 'Road Name' },
                { key: 'roadNumber', label: 'Road Number' },
                { key: 'county', label: 'County' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    value={data[f.key] as string} onChange={e => update(f.key, e.target.value)} />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Chainage Start</label>
                <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  value={data.chainageStart} onChange={e => update('chainageStart', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Chainage End</label>
                <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  value={data.chainageEnd} onChange={e => update('chainageEnd', parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          {/* Construction */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 text-sm mb-3">Construction Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Contractor</label>
                <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  value={data.contractorName} onChange={e => update('contractorName', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Client</label>
                <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  value={data.clientName} onChange={e => update('clientName', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Completion Date</label>
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  value={data.completionDate} onChange={e => update('completionDate', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Design Speed (km/h)</label>
                <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  value={data.designSpeed} onChange={e => update('designSpeed', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          {/* Surveyor */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 text-sm mb-3">Surveyor Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  value={data.surveyorName} onChange={e => update('surveyorName', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ISK Registration</label>
                <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  value={data.surveyorRegistration} onChange={e => update('surveyorRegistration', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Firm</label>
                <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  value={data.surveyorFirm} onChange={e => update('surveyorFirm', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Certification Checklist */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 text-sm mb-3">Certification Checklist</h4>
            <div className="space-y-2">
              {CERTIFICATION_ITEMS.map(item => (
                <label key={item.key} className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 rounded" checked={data[item.key as keyof RoadCompletionData] as boolean}
                    onChange={e => update(item.key, e.target.checked)} />
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-gray-500">{item.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Defects */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 text-sm mb-3">Defects ({defects.length})</h4>
            {defects.map((d, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <select className="border border-gray-300 rounded px-2 py-1 text-xs" value={d.severity}
                  onChange={e => { const nd = [...defects]; nd[i] = { ...d, severity: e.target.value as any }; setDefects(nd) }}>
                  <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
                </select>
                <input type="number" className="w-20 border border-gray-300 rounded px-2 py-1 text-xs" placeholder="Chainage"
                  value={d.chainage} onChange={e => { const nd = [...defects]; nd[i] = { ...d, chainage: parseFloat(e.target.value) || 0 }; setDefects(nd) }} />
                <input type="text" className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs" placeholder="Description"
                  value={d.description} onChange={e => { const nd = [...defects]; nd[i] = { ...d, description: e.target.value }; setDefects(nd) }} />
                <button onClick={() => setDefects(defects.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
              </div>
            ))}
            <button onClick={() => setDefects([...defects, { chainage: 0, description: '', severity: 'minor' }])}
              className="text-xs text-blue-600 hover:text-blue-800">+ Add Defect</button>
            {defects.length > 0 && update('defectsNoted', defects.map(d => `[${d.severity}] CH${d.chainage}: ${d.description}`))}
          </div>

          {/* Reservations */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 text-sm mb-3">Reservations</h4>
            <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16"
              placeholder="Any reservations or conditions..."
              onChange={e => update('reservations', e.target.value.split('\n').filter(Boolean))} />
          </div>

          <button onClick={handleGenerate}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
            Generate Certificate
          </button>
        </div>

        {/* Preview */}
        <div>
          {certificate && showPreview ? (
            <div className="bg-white rounded-xl border-2 border-gray-300 p-8 shadow-lg">
              <CertificatePreview certificate={certificate} />
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <p className="text-gray-400">Fill in the form and click &quot;Generate Certificate&quot;</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── CERTIFICATE PREVIEW ──────────────────────────────────────────────────────

function CertificatePreview({ certificate }: { certificate: ReturnType<typeof generateCertificate> }) {
  return (
    <div className="space-y-4 text-sm">
      {/* Header */}
      <div className="text-center border-b-2 border-gray-800 pb-4">
        <h2 className="text-lg font-bold text-gray-900 tracking-wider">REPUBLIC OF KENYA</h2>
        <h3 className="text-2xl font-bold mt-1">{certificate.title}</h3>
        <p className="text-xs text-gray-500 mt-1">Kenya Roads Act, Cap 407 • RDM 1.3 • Survey Act Cap 299</p>
        <p className="text-xs text-gray-500 mt-1">Certificate No: <span className="font-mono font-bold">{certificate.certificateNumber}</span> • Date: {certificate.issueDate}</p>
      </div>

      {/* Status Badge */}
      <div className={`text-center py-2 rounded-lg ${certificate.isComplete ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
        <span className="font-bold">{certificate.isComplete ? '✓ CERTIFIED — COMPLIANT' : '⚠ PENDING — RESERVATIONS NOTED'}</span>
      </div>

      {/* Sections */}
      {certificate.sections.map((section, i) => (
        <div key={i}>
          <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200 pb-1 mb-2">{section.title}</h4>
          <table className="w-full text-xs">
            <tbody>
              {section.rows.map((row, j) => (
                <tr key={j}>
                  <td className="py-1 text-gray-500 w-1/3 border-b border-gray-100">{row.label}</td>
                  <td className="py-1 font-medium text-gray-900 border-b border-gray-100">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Certification Checklist */}
      <div>
        <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200 pb-1 mb-2">CERTIFICATION CHECKLIST</h4>
        <div className="grid grid-cols-2 gap-1">
          {certificate.certificationChecklist.map((item, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs py-1 ${item.certified ? 'text-green-700' : 'text-red-700'}`}>
              {item.certified ? '✓' : '✗'} {item.item}
            </div>
          ))}
        </div>
      </div>

      {/* Compliance Notes */}
      {certificate.complianceNotes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <h4 className="font-bold text-xs text-amber-800 mb-1">COMPLIANCE NOTES</h4>
          {certificate.complianceNotes.map((note, i) => (
            <p key={i} className="text-xs text-amber-700">• {note}</p>
          ))}
        </div>
      )}

      {/* Declaration */}
      <div className="border-t border-gray-300 pt-4">
        <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wider mb-2">DECLARATION</h4>
        <p className="text-xs text-gray-700 leading-relaxed">{certificate.declaration.substring(0, 300)}...</p>
      </div>

      {/* Signature Block */}
      <div className="border-t border-gray-300 pt-6 mt-6">
        <div className="border-b border-gray-400 w-48 mb-2" />
        <div className="text-xs">
          <div className="font-bold">{certificate.signatureBlock.surveyorName}</div>
          <div>{certificate.signatureBlock.surveyorRegistration}</div>
          <div>{certificate.signatureBlock.surveyorFirm}</div>
          <div>Date: {certificate.signatureBlock.date}</div>
        </div>
      </div>
    </div>
  )
}
