'use client'

import { useState, useRef } from 'react'
import { interpretCSV, CSVInterpretResult } from '@/lib/parsers/csvSurveyInterpreter'
import Link from 'next/link'

export default function ProcessPage() {
  const [dragActive, setDragActive] = useState(false)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [interpretResult, setInterpretResult] = useState<CSVInterpretResult | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processed, setProcessed] = useState(false)
  const [manualType, setManualType] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const files = e.dataTransfer.files
    if (files && files[0]) {
      const content = await files[0].text()
      setFileContent(content)
      const result = interpretCSV(content)
      setInterpretResult(result)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      const content = await files[0].text()
      setFileContent(content)
      const result = interpretCSV(content)
      setInterpretResult(result)
    }
  }

  const processSurvey = () => {
    setProcessing(true)
    setTimeout(() => {
      setProcessing(false)
      setProcessed(true)
    }, 1500)
  }

  const detectLabel = (type: string) => {
    switch (type) {
      case 'leveling': return 'Leveling Run'
      case 'traverse': return 'Traverse Survey'
      case 'radiation': return 'Radiation / Detail Survey'
      case 'boundary': return 'Boundary / Parcel'
      default: return 'Unknown Survey Type'
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Process Field Notes</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Upload your CSV field notes — GeoNova detects the survey type and processes automatically
      </p>

      {!fileContent ? (
        <>
          {/* Upload Zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragActive 
                ? 'border-[var(--accent)] bg-[var(--accent)]/10' 
                : 'border-gray-700 hover:border-gray-600'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-6xl mb-4">📋</div>
            <p className="text-lg font-semibold text-gray-200 mb-2">
              Drop your field notes here or click to upload
            </p>
            <p className="text-sm text-gray-500">
              Accepts: .csv, .txt files
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Sample Files */}
          <div className="mt-8 p-6 bg-gray-900/50 rounded-xl border border-gray-800">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">Download Sample Files</h3>
            <div className="flex flex-wrap gap-3">
              <a href="/sample-files/traverse_sample.csv" className="btn btn-secondary text-sm">
                📄 Traverse Sample
              </a>
              <a href="/sample-files/leveling_sample.csv" className="btn btn-secondary text-sm">
                📄 Leveling Sample
              </a>
              <a href="/sample-files/radiation_sample.csv" className="btn btn-secondary text-sm">
                📄 Radiation Sample
              </a>
            </div>
          </div>
        </>
      ) : interpretResult?.ok && interpretResult.dataset ? (
        <div className="space-y-6">
          {/* Detection Result */}
          <div className="card">
            <div className="card-header flex items-center gap-3">
              <span className="text-2xl">✓</span>
              <span className="label">
                {detectLabel(interpretResult.dataset!.surveyType)} Detected
              </span>
            </div>
            <div className="card-body">
              <p className="text-sm text-gray-300 mb-4">
                {interpretResult.dataset!.observations.length} observations found
              </p>

              {/* Show observations preview */}
              <div className="bg-gray-800 rounded p-3 overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="px-2 py-1">Station</th>
                      <th className="px-2 py-1">Type</th>
                      <th className="px-2 py-1">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interpretResult.dataset!.observations.slice(0, 5).map((obs, i) => (
                      <tr key={i} className="border-t border-gray-700">
                        <td className="px-2 py-1">{obs.station}</td>
                        <td className="px-2 py-1 text-[var(--accent)]">{obs.type}</td>
                        <td className="px-2 py-1 font-mono">{obs.value1}</td>
                      </tr>
                    ))}
                    {interpretResult.dataset!.observations.length > 5 && (
                      <tr>
                        <td colSpan={3} className="px-2 py-1 text-gray-500 text-center">
                          ... and {interpretResult.dataset!.observations.length - 5} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {interpretResult.warnings.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded">
                  {interpretResult.warnings.map((w, i) => (
                    <p key={i} className="text-sm text-yellow-400">⚠ {w}</p>
                  ))}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={processSurvey}
                  disabled={processing}
                  className="btn btn-primary"
                >
                  {processing ? 'Processing...' : 'Process Survey'}
                </button>
                <button
                  onClick={() => {
                    setFileContent(null)
                    setInterpretResult(null)
                    setProcessed(false)
                  }}
                  className="btn btn-secondary"
                >
                  Upload Different File
                </button>
              </div>
            </div>
          </div>

          {/* Processing Result */}
          {processed && (
            <div className="card border-[var(--accent)]">
              <div className="card-header flex items-center gap-3">
                <span className="text-2xl">✓</span>
                <span className="label">Survey Processed Successfully</span>
              </div>
              <div className="card-body space-y-4">
                <p className="text-gray-300">
                  Your {detectLabel(interpretResult.dataset!.surveyType)} has been processed.
                </p>
                <div className="flex gap-3">
                  <Link href="/dashboard" className="btn btn-primary">
                    View in Project
                  </Link>
                  <button className="btn btn-secondary">
                    Generate Report
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card border-red-800">
          <div className="card-header">
            <span className="label text-red-400">Upload Failed</span>
          </div>
          <div className="card-body">
            <p className="text-gray-300 mb-4">
              {interpretResult?.error || 'Could not parse the uploaded file'}
            </p>
            {interpretResult?.warnings.map((w, i) => (
              <p key={i} className="text-sm text-yellow-400">⚠ {w}</p>
            ))}
            
            {/* Manual type selector */}
            <div className="mt-6 p-4 bg-gray-800 rounded">
              <p className="text-sm text-gray-400 mb-3">Or select survey type manually:</p>
              <select
                value={manualType}
                onChange={(e) => setManualType(e.target.value)}
                className="input mb-3"
              >
                <option value="">Select type...</option>
                <option value="leveling">Leveling Run</option>
                <option value="traverse">Traverse Survey</option>
                <option value="radiation">Radiation / Detail</option>
              </select>
              {manualType && (
                <button className="btn btn-primary">
                  Process as {detectLabel(manualType)}
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setFileContent(null)
                setInterpretResult(null)
              }}
              className="btn btn-secondary mt-4"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
