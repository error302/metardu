'use client'

import { useMemo, useState } from 'react'
import { calculateProjectDrainageRuns } from '@/lib/engineering/projectDrainageEngine'
import type { DrainageData, PipeRun } from '@/types/engineering'
import { PipeFlowScreening } from './PipeFlowScreening'

/** Derive each run from measured chainage and the two pipe-end invert levels. */
export function DrainageStep2Pipes({
  data,
  onSave,
}: {
  data: DrainageData | null
  onSave: (pipeRuns: PipeRun[]) => void | Promise<boolean>
}) {
  const manholes = useMemo(() => data?.manholes ?? [], [data?.manholes])
  const { runs, issues } = useMemo(() => calculateProjectDrainageRuns(manholes), [manholes])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      const result = await onSave(runs)
      if (result === false) {
        setSaveError('METARDU could not save this run schedule. Check the connection and try again.')
        return
      }
      setSaved(true)
    } catch {
      setSaveError('METARDU could not save this run schedule. Check the connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 text-lg font-semibold text-white">Pipe run calculations</h3>
        <p className="text-sm text-zinc-400">Length comes from the two manhole chainages. Fall uses the upstream outgoing invert and downstream incoming invert. Manning estimates now screen the free-surface normal depth and the peak open-channel rate separately from the full-bore reference. They do not verify inlet/outlet control, HGL/backwater, surcharge at manholes, or standards compliance.</p>
      </div>

      {issues.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-200">
          <p className="mb-2 font-semibold">The run schedule is incomplete:</p>
          <ul className="list-inside list-disc space-y-1">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
        </div>
      )}

      {runs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-zinc-800 text-zinc-300">
                <th className="px-3 py-2 text-left">Run</th>
                <th className="px-3 py-2 text-right">Length (m)</th>
                <th className="px-3 py-2 text-right">Fall (m)</th>
                <th className="px-3 py-2 text-right">Gradient (1 in n)</th>
                <th className="px-3 py-2 text-right">ID (mm)</th>
                <th className="px-3 py-2 text-left">Material</th>
                <th className="px-3 py-2 text-right">Manning n</th>
                <th className="px-3 py-2 text-right">Full-bore velocity (m/s)</th>
                <th className="px-3 py-2 text-right">Full-bore capacity (L/s)</th>
                <th className="px-3 py-2 text-left">Design-flow screening</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, index) => {
                const gradientRatio = run.gradient > 0 ? 100 / run.gradient : undefined
                return (
                  <tr key={`${run.fromMH}-${run.toMH}-${index}`} className="border-t border-zinc-800">
                    <td className="px-3 py-2 font-medium text-white">{run.fromMH} → {run.toMH}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{run.length.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{(run.length * run.gradient / 100).toFixed(3)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{gradientRatio ? `1 in ${gradientRatio.toFixed(1)}` : '—'}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{run.internalDiameterMm.toFixed(1)}</td>
                    <td className="px-3 py-2 text-zinc-300">{run.material}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{run.manningN.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{run.velocity.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{(run.fullBoreCapacity * 1000).toFixed(2)}</td>
                    <td className="px-3 py-2 text-zinc-300">
                      <PipeFlowScreening run={run} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={issues.length > 0 || runs.length !== manholes.length - 1 || saving}
        className="rounded-lg bg-amber-500 px-6 py-2.5 font-semibold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? 'Saving…' : saved ? 'Run schedule saved' : 'Save calculated run schedule'}
      </button>
      {saveError && <p role="alert" className="text-sm text-red-300">{saveError}</p>}
    </div>
  )
}
