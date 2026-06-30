'use client'

import { useState } from 'react'
import type { CrossSectionTemplate, RoadDesignData } from '@/types/engineering'

/**
 * Step 4 — Cross Section Template (carriageway, shoulders, slopes).
 *
 * Extracted verbatim from src/app/project/[id]/engineering/page.tsx.
 */
export function Step4CrossSection({
  data,
  onSave
}: {
  data: RoadDesignData | null
  onSave: (template: CrossSectionTemplate) => void
}) {
  const [template, setTemplate] = useState<CrossSectionTemplate>(data?.crossSectionTemplate || {
    carriagewayWidth: 6.0,
    shoulderWidth: 1.0,
    cutSlope: '1:1',
    fillSlope: '1:1.5',
    camber: 3,
    subgradeDepth: 0.5
  })

  const handleSave = () => {
    onSave(template)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Cross Section Template</h3>
        <p className="text-zinc-400 text-sm">Define standard cross section parameters.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Carriageway Width (m)</label>
          <input
            type="number"
            step="0.1"
            value={template.carriagewayWidth}
            onChange={e => setTemplate({ ...template, carriagewayWidth: Number(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Shoulder Width (m)</label>
          <input
            type="number"
            step="0.1"
            value={template.shoulderWidth}
            onChange={e => setTemplate({ ...template, shoulderWidth: Number(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Camber (%)</label>
          <input
            type="number"
            step="0.5"
            value={template.camber}
            onChange={e => setTemplate({ ...template, camber: Number(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Cut Slope (H:V)</label>
          <input
            type="text"
            value={template.cutSlope}
            onChange={e => setTemplate({ ...template, cutSlope: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
            placeholder="1:1"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Fill Slope (H:V)</label>
          <input
            type="text"
            value={template.fillSlope}
            onChange={e => setTemplate({ ...template, fillSlope: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
            placeholder="1:1.5"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Subgrade Depth (m)</label>
          <input
            type="number"
            step="0.1"
            value={template.subgradeDepth}
            onChange={e => setTemplate({ ...template, subgradeDepth: Number(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        className="px-6 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400"
      >
        Save Template
      </button>
    </div>
  )
}
