'use client'

import { useState } from 'react'
import NLIMSLookup from '@/components/registry/NLIMSLookup'

export default function RegistryPage() {
  const [activeTab, setActiveTab] = useState<'nlims' | 'kencors'>('nlims')

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Land Registry</h1>
        <p className="text-[var(--text-muted)] mb-8">
          Kenya land registry integration for parcel verification and RTK corrections
        </p>

        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setActiveTab('nlims')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'nlims'
                ? 'bg-sky-600 text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]'
            }`}
          >
            Parcel Lookup
          </button>
          <button
            onClick={() => setActiveTab('kencors')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'kencors'
                ? 'bg-sky-600 text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]'
            }`}
          >
            KenCORS Status
          </button>
        </div>

        {activeTab === 'nlims' && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold mb-4">NLIMS Parcel Lookup</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Search Kenya's National Land Information Management System for parcel ownership,
              title deed details, and registration status.
            </p>
            <NLIMSLookup />
          </div>
        )}

        {activeTab === 'kencors' && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold mb-4">KenCORS RTK Network</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Kenya Continuously Operating Reference Stations for real-time GNSS corrections.
              Cite: Survey Act Cap 299 s.9 — national control network
            </p>
            <div className="p-8 text-center bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-600">
                KenCORS stations are now displayed in the project Map tab using OpenLayers.
                Navigate to any project and click the Map tab to view the 3 nearest KenCORS stations.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
