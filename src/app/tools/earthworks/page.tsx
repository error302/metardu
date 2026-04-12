'use client'

import EarthworksCalculator from '@/components/earthworks/CrossSectionInput'

export default function EarthworksPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Earthworks</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Cross Sections &amp; Earthwork Quantities | Source: Ghilani &amp; Wolf Ch.26 | Merritt Civil Engineering Handbook Sec.21 | End Area + Prismoidal Methods
      </p>
      <EarthworksCalculator />
    </div>
  )
}
