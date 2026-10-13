'use client'

import { useState } from 'react'
import type { CrossSectionTemplate, RoadDesignData } from '@/types/engineering'
import { validateRoadTemplate } from '@/lib/engineering/roadProjectOutputs'

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
  const [error, setError] = useState('')

  const handleSave = () => {
    try { validateRoadTemplate(template); setError(''); onSave(template) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Review the template inputs.') }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Cross Section Template</h3>
        <p className="text-zinc-400 text-sm">Enter the approved crowned road template. Review the starting values; they are examples, not a design-standard assessment. Slopes retain the existing H:V convention.</p>
      </div>

      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="carriagewayWidth" className="block text-sm text-zinc-400 mb-1">Carriageway Width (m)</label>
          <input id="carriagewayWidth"
            type="number"
            step="0.1"
            value={Number.isFinite(template.carriagewayWidth) ? template.carriagewayWidth : ''}
            onChange={e => setTemplate({ ...template, carriagewayWidth: e.target.value.trim() ? Number(e.target.value) : NaN })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
        <div>
          <label htmlFor="shoulderWidth" className="block text-sm text-zinc-400 mb-1">Shoulder Width (m)</label>
          <input id="shoulderWidth"
            type="number"
            step="0.1"
            value={Number.isFinite(template.shoulderWidth) ? template.shoulderWidth : ''}
            onChange={e => setTemplate({ ...template, shoulderWidth: e.target.value.trim() ? Number(e.target.value) : NaN })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
        <div>
          <label htmlFor="camber" className="block text-sm text-zinc-400 mb-1">Camber (%)</label>
          <input id="camber"
            type="number"
            step="0.5"
            value={Number.isFinite(template.camber) ? template.camber : ''}
            onChange={e => setTemplate({ ...template, camber: e.target.value.trim() ? Number(e.target.value) : NaN })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
        <div>
          <label htmlFor="shoulderCrossfall" className="block text-sm text-zinc-400 mb-1">Approved shoulder crossfall (%)</label>
          <input id="shoulderCrossfall" type="number" step="any" min="0" value={template.shoulderCrossfall ?? ''}
            onChange={event => setTemplate({ ...template, shoulderCrossfall: event.target.value === '' ? undefined : Number(event.target.value) })}
            className="min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white" />
        </div>
        <div>
          <label htmlFor="cutSlope" className="block text-sm text-zinc-400 mb-1">Cut Slope (H:V)</label>
          <input
            id="cutSlope"
            type="text"
            value={template.cutSlope}
            onChange={e => setTemplate({ ...template, cutSlope: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
            placeholder="1:1"
          />
        </div>
        <div>
          <label htmlFor="fillSlope" className="block text-sm text-zinc-400 mb-1">Fill Slope (H:V)</label>
          <input
            id="fillSlope"
            type="text"
            value={template.fillSlope}
            onChange={e => setTemplate({ ...template, fillSlope: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
            placeholder="1:1.5"
          />
        </div>
        <div>
          <label htmlFor="subgradeDepth" className="block text-sm text-zinc-400 mb-1">Subgrade Depth (m)</label>
          <input id="subgradeDepth"
            type="number"
            step="0.1"
            value={Number.isFinite(template.subgradeDepth) ? template.subgradeDepth : ''}
            onChange={e => setTemplate({ ...template, subgradeDepth: e.target.value.trim() ? Number(e.target.value) : NaN })}
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
