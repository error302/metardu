'use client';

import { useState } from 'react'
import { analyzeBoundarySituation, type LegalGuidance } from '@/lib/legal/landLawEngine'

/** Parcel records available to the current METARDU account plus boundary guidance. */

interface NLIMSLookupResult {
  found: boolean
  parcel?: {
    parcelNumber: string
    registrationSection?: string
    county?: string
    area?: number
    areaHectares?: number
    ownerName?: string
    ownerType?: string
    titleDeedNumber?: string
    titleDeedDate?: string
    encumbrances?: string[]
    status?: string
    lastTransactionDate?: string
    lastTransactionType?: string
    source?: string
    fetchedAt?: string
  }
  error?: string
  code?: string
  source?: 'VAULT_PERSONAL' | 'VAULT_SHARED' | 'METARDU_CACHE'
  freshness?: string
  certificateDate?: string
}

export default function ParcelSearchPage() {
  const [activeTab, setActiveTab] = useState<'search' | 'legal'>('search')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<NLIMSLookupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [legalGuidance, setLegalGuidance] = useState<LegalGuidance | null>(null)

  const [parcelNumber, setParcelNumber] = useState('')
  const [county, setCounty] = useState('')

  const handleSearch = async () => {
    if (!parcelNumber.trim()) {
      setError('Enter a parcel number to search')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const params = new URLSearchParams({ parcel: parcelNumber.trim() })
      if (county.trim()) params.set('county', county.trim())

      const res = await fetch(`/api/nlims/lookup?${params}`, {
        credentials: 'include',
      })
      const data = await res.json() as NLIMSLookupResult

      if (!res.ok) {
        setError(data.error || `Search failed (HTTP ${res.status})`)
      } else if (!data.found) {
        setError(data.error || 'No matching parcel is available in METARDU records. A local miss does not mean the parcel is absent from the official register.')
      } else {
        setResult(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleLegalGuidance = (situation: 'missing_monument' | 'overlap' | 'area_discrepancy' | 'encroachment' | 'coordinate_mismatch' | 'subdivision') => {
    const guidance = analyzeBoundarySituation(situation)
    setLegalGuidance(guidance)
  }

  const legalScenarios = [
    { id: 'missing_monument', label: 'Missing Boundary Monument' },
    { id: 'overlap', label: 'Parcel Boundary Overlap' },
    { id: 'area_discrepancy', label: 'Area Discrepancy' },
    { id: 'encroachment', label: 'Encroachment Detected' },
    { id: 'coordinate_mismatch', label: 'Coordinate Mismatch' },
    { id: 'subdivision', label: 'Subdivision Compliance' }
  ]

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Parcel records and boundary guidance</h1>
        <p className="text-[var(--text-muted)] mb-8">Search records available to your METARDU account and review general boundary guidance.</p>

        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'search'
                ? 'bg-sky-600 text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]'
            }`}
          >
            METARDU parcel records
          </button>
          <button
            onClick={() => setActiveTab('legal')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'legal'
                ? 'bg-sky-600 text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]'
            }`}
          >
            Land Law Advisor
          </button>
        </div>

        {activeTab === 'search' && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold mb-2">Search available parcel records</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Searches your personal parcel vault, shared reference records, and recently cached records. METARDU is not connected to live government registry search; a local miss does not establish title, ownership, or parcel status.
            </p>
            <a href="https://ardhisasa.lands.go.ke/home" target="_blank" rel="noreferrer" className="mb-6 inline-flex min-h-11 items-center rounded-lg border border-[var(--border-color)] px-4 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--accent)]">
              Open the official Ardhisasa portal <span className="sr-only"> (opens in a new tab)</span>
            </a>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="md:col-span-2">
                <label htmlFor="parcel-number" className="block text-sm font-medium text-[var(--text-muted)] mb-1">Parcel Number</label>
                <input
                  id="parcel-number"
                  type="text"
                  value={parcelNumber}
                  onChange={e => setParcelNumber(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g., NRM/KISUMU/12345"
                  className="w-full p-2 border rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-color)]"
                />
              </div>
              <div>
                <label htmlFor="parcel-county" className="block text-sm font-medium text-[var(--text-muted)] mb-1">County (optional)</label>
                <input
                  id="parcel-county"
                  type="text"
                  value={county}
                  onChange={e => setCounty(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g., Nairobi"
                  className="w-full p-2 border rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-color)]"
                />
              </div>
            </div>

            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-sky-600 text-white py-2 px-6 rounded-lg hover:bg-sky-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'Searching...' : 'Search METARDU records'}
            </button>

            {error && (
              <div className="mt-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
                {error}
              </div>
            )}

            {result && result.found && result.parcel && (
              <div className="mt-6 p-5 border rounded-lg bg-[var(--bg-secondary)] border-[var(--border-color)] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg text-[var(--text-primary)]">
                    {result.parcel.parcelNumber}
                  </h3>
                  <div className="flex gap-2">
                    {result.source && (
                      <span className="px-2 py-1 bg-blue-500/15 text-blue-400 text-xs rounded">
                        {result.source.replace(/_/g, ' ')}
                      </span>
                    )}
                    {result.source === 'VAULT_SHARED' && (
                      <span className="px-2 py-1 bg-yellow-500/15 text-yellow-400 text-xs rounded">
                        community reference · verify
                      </span>
                    )}
                    {result.source === 'METARDU_CACHE' && (
                      <span className="px-2 py-1 bg-yellow-500/15 text-yellow-400 text-xs rounded">
                        cached copy · verify date
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  {result.parcel.county && (
                    <div><span className="text-[var(--text-muted)]">County:</span> <span className="text-[var(--text-primary)]">{result.parcel.county}</span></div>
                  )}
                  {result.parcel.registrationSection && (
                    <div><span className="text-[var(--text-muted)]">Section:</span> <span className="text-[var(--text-primary)]">{result.parcel.registrationSection}</span></div>
                  )}
                  {result.parcel.areaHectares != null && (
                    <div><span className="text-[var(--text-muted)]">Area:</span> <span className="text-[var(--text-primary)]">{result.parcel.areaHectares.toFixed(4)} ha</span></div>
                  )}
                  {result.parcel.titleDeedNumber && (
                    <div><span className="text-[var(--text-muted)]">Title Deed:</span> <span className="text-[var(--text-primary)]">{result.parcel.titleDeedNumber}</span></div>
                  )}
                  {result.parcel.status && (
                    <div><span className="text-[var(--text-muted)]">Status:</span> <span className="text-[var(--text-primary)]">{result.parcel.status}</span></div>
                  )}
                  {result.parcel.ownerType && (
                    <div><span className="text-[var(--text-muted)]">Owner Type:</span> <span className="text-[var(--text-primary)]">{result.parcel.ownerType}</span></div>
                  )}
                  {result.certificateDate && (
                    <div><span className="text-[var(--text-muted)]">Certificate Date:</span> <span className="text-[var(--text-primary)]">{result.certificateDate}</span></div>
                  )}
                  {result.freshness && (
                    <div><span className="text-[var(--text-muted)]">Freshness:</span> <span className="text-[var(--text-primary)]">{result.freshness}</span></div>
                  )}
                </div>

                <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-[var(--text-muted)]">
                  This is a METARDU-held record, not a current government title search or survey-coordinate authority. Confirm title and parcel status through the official portal, and use approved survey plans and control for survey work.
                </p>

                {result.parcel.ownerName && result.parcel.ownerName !== '[Community Shared - Owner Hidden]' && (
                  <div><span className="text-[var(--text-muted)] text-sm">Owner:</span> <span className="text-[var(--text-primary)] text-sm">{result.parcel.ownerName}</span></div>
                )}

                {result.parcel.encumbrances && result.parcel.encumbrances.length > 0 && (
                  <div>
                    <span className="text-[var(--text-muted)] text-sm">Encumbrances:</span>
                    <ul className="text-sm text-[var(--text-primary)] ml-4 mt-1">
                      {result.parcel.encumbrances.map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  </div>
                )}

                {result.parcel.fetchedAt && (
                  <p className="text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-color)]">
                    Data fetched: {new Date(result.parcel.fetchedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'legal' && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold mb-4">Land Law Advisory System</h2>
            <p className="text-[var(--text-muted)] mb-6">
              Get professional guidance on boundary situations based on cadastral surveying principles.
              References: Brown's Boundary Control and Legal Principles
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-3">Select Situation</h3>
                <div className="space-y-2">
                  {legalScenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      onClick={() => handleLegalGuidance(scenario.id as 'missing_monument' | 'overlap' | 'area_discrepancy' | 'encroachment' | 'coordinate_mismatch' | 'subdivision')}
                      className="w-full text-left p-3 border rounded-lg hover:bg-[var(--bg-secondary)] hover:border-sky-300 transition"
                    >
                      {scenario.label}
                    </button>
                  ))}
                </div>
              </div>

              {legalGuidance && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg ${
                    legalGuidance.severity === 'critical' ? 'bg-red-50 border border-red-200' :
                    legalGuidance.severity === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                    'bg-blue-50 border border-blue-200'
                  }`}>
                    <h3 className="font-semibold">{legalGuidance.scenario}</h3>
                    <span className={`text-xs px-2 py-1 rounded uppercase ${
                      legalGuidance.severity === 'critical' ? 'bg-red-200 text-red-800' :
                      legalGuidance.severity === 'warning' ? 'bg-yellow-200 text-yellow-800' :
                      'bg-blue-200 text-blue-800'
                    }`}>
                      {legalGuidance.severity}
                    </span>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Principles</h4>
                    <ul className="text-sm space-y-1">
                      {legalGuidance.principles.map((p: string, i: number) => (
                        <li key={i} className="text-[var(--text-muted)]">• {p}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Recommendations</h4>
                    <ul className="text-sm space-y-1">
                      {legalGuidance.recommendations.map((r: string, i: number) => (
                        <li key={i} className="text-[var(--text-muted)]"> {r}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <h4 className="font-medium mb-2 text-sm">References</h4>
                    {legalGuidance.references.map((ref: { book: string; chapter: string }, i: number) => (
                      <p key={i} className="text-xs text-[var(--text-muted)]">
                        {ref.book}, Chapter: {ref.chapter}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
