'use client'

import { useState } from 'react'
import type { IntersectionPoint, RoadDesignData } from '@/types/engineering'
import { projectTransitionLength } from '@/lib/engineering/roadHorizontalAlignment'

/**
 * Saved horizontal design inputs; calculations remain in the shared engine.
 */
export function Step2Horizontal({
  data,
  onSave
}: {
  data: RoadDesignData | null
  onSave: (ips: IntersectionPoint[]) => void | boolean | Promise<void | boolean>
}) {
  const [ips, setIps] = useState<IntersectionPoint[]>(data?.ips || [])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const addIP = () => {
    const newIp: IntersectionPoint = {
      id: crypto.randomUUID(),
      name: `IP${ips.length + 1}`,
      easting: Number.NaN,
      northing: Number.NaN,
      radius: 0
    }
    setIps([...ips, newIp])
  }

  const updateIP = (index: number, field: keyof IntersectionPoint, value: IntersectionPoint[keyof IntersectionPoint]) => {
    const updated = [...ips]
    updated[index] = { ...updated[index], [field]: value }
    setIps(updated)
  }

  const removeIP = (index: number) => {
    setIps(ips.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (ips.some(ip => !ip.name.trim() || ![ip.easting, ip.northing, ip.radius].every(Number.isFinite) || ip.radius < 0)) {
      setError('Enter complete finite coordinates and a non-negative radius. Radius 0 records no curve; it does not infer a design radius.')
      return
    }
    if (ips.some((ip, i) => i > 0 && ip.easting === ips[i - 1].easting && ip.northing === ips[i - 1].northing)) { setError('Adjacent points must have distinct coordinates.'); return }
    try {
      ips.forEach((ip, i) => {
        const length = projectTransitionLength(ip)
        if ((i === 0 || i === ips.length - 1) && (ip.hasTransition || length > 0)) throw new RangeError(`${ip.name}: clear the transition on this endpoint; it requires a middle PI.`)
      })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Review transition lengths.'); return }
    setError('')
    setSaving(true)
    try {
      if (await onSave(ips) === false) throw new Error('Alignment inputs could not be saved. Retry before leaving this step.')
    } catch { setError('Alignment inputs could not be saved. Retry before leaving this step.') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Horizontal Alignment</h3>
        <p className="text-zinc-400 text-sm">Enter endpoints and middle intersection points in route order. Each curve uses its middle PI radius. Add supplied equal entry/exit clothoid lengths for a transition curve; no length is inferred from design speed. Coordinates must use the saved project CRS.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

      {ips.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <p>No IPs defined. Add at least 2 IPs for a valid alignment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ips.map((ip, idx) => (
            <div key={ip.id} className="border border-zinc-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-white">IP {idx + 1}</span>
                <button
                  onClick={() => removeIP(idx)}
                  className="text-red-400 text-sm hover:text-red-300"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label htmlFor={`ip-${idx}-name`} className="block text-xs text-zinc-500 mb-1">Name</label>
                  <input id={`ip-${idx}-name`}
                    type="text"
                    value={ip.name}
                    onChange={e => updateIP(idx, 'name', e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label htmlFor={`ip-${idx}-easting`} className="block text-xs text-zinc-500 mb-1">Easting (m)</label>
                  <input id={`ip-${idx}-easting`}
                    type="number"
                    value={Number.isFinite(ip.easting) ? ip.easting : ''}
                    onChange={e => updateIP(idx, 'easting', e.target.value === '' ? Number.NaN : Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label htmlFor={`ip-${idx}-northing`} className="block text-xs text-zinc-500 mb-1">Northing (m)</label>
                  <input id={`ip-${idx}-northing`}
                    type="number"
                    value={Number.isFinite(ip.northing) ? ip.northing : ''}
                    onChange={e => updateIP(idx, 'northing', e.target.value === '' ? Number.NaN : Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label htmlFor={`ip-${idx}-radius`} className="block text-xs text-zinc-500 mb-1">Radius (m)</label>
                  <input id={`ip-${idx}-radius`}
                    type="number"
                    value={Number.isFinite(ip.radius) ? ip.radius : ''}
                    onChange={e => updateIP(idx, 'radius', e.target.value === '' ? Number.NaN : Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
              </div>
              {(idx > 0 && idx < ips.length - 1 || ip.hasTransition || (ip.transitionLengthIn ?? 0) > 0 || (ip.transitionLengthOut ?? 0) > 0) && <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" aria-label={`Use transition spirals at PI ${idx + 1}`}
                    checked={ip.hasTransition ?? ((ip.transitionLengthIn ?? 0) > 0 || (ip.transitionLengthOut ?? 0) > 0)}
                    onChange={e => setIps(ips.map((point, i) => i !== idx ? point : { ...point, hasTransition: e.target.checked,
                      ...(e.target.checked ? {} : { transitionLengthIn: undefined, transitionLengthOut: undefined, spiralParameters: undefined }) }))} />
                  Use supplied transition spirals
                </label>
                {(ip.hasTransition ?? ((ip.transitionLengthIn ?? 0) > 0 || (ip.transitionLengthOut ?? 0) > 0)) && <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(['In', 'Out'] as const).map(side => <div key={side}>
                      <label htmlFor={`ip-${idx}-spiral-${side}`} className="mb-1 block text-xs text-zinc-400">{side === 'In' ? 'Entry' : 'Exit'} spiral length (m)</label>
                      <input id={`ip-${idx}-spiral-${side}`} aria-label={`${side === 'In' ? 'Entry' : 'Exit'} spiral length at PI ${idx + 1} (m)`}
                        type="number" min="0" step="any" value={Number.isFinite(ip[`transitionLength${side}`]) ? ip[`transitionLength${side}`] : ''}
                        onChange={e => updateIP(idx, `transitionLength${side}`, e.target.value === '' ? Number.NaN : Number(e.target.value))}
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white" />
                    </div>)}
                  </div>
                  <p className="text-xs text-zinc-400">The connected engine supports equal entry/exit lengths. Explicit 0/0 uses a circular curve. Asymmetric transitions remain unevaluated.</p>
                </>}
              </div>}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addIP}
        className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
      >
        + Add IP
      </button>

      {ips.length >= 2 && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400"
        >
          {saving ? 'Saving IPs…' : 'Save IPs'}
        </button>
      )}
    </div>
  )
}
