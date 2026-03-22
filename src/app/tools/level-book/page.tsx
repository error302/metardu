'use client'

import LevelBook from '@/components/LevelBook'

export default function LevelBookPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Level Book</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Direct differential leveling reduction | Survey Act Cap 299 | RDM 1.1 (2025)
      </p>
      <LevelBook />
    </div>
  )
}
