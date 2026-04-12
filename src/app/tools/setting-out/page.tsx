'use client'

import SettingOutCalculator from '@/components/setting-out/SettingOutCalculator'

export default function SettingOutPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Setting Out</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Generate setting out angles, distances and stake out sheets | Source: Ghilani &amp; Wolf Ch.23 | RDM 1.1 Table 5.2
      </p>
      <SettingOutCalculator />
    </div>
  )
}
