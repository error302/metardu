'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { DrainageData } from '@/types/engineering'
import { calculateProjectDrainageRuns, generateProjectDrainageSetout } from '@/lib/engineering/projectDrainageEngine'
import { PipeFlowScreening } from './PipeFlowScreening'

const rl = (value: number | null | undefined) => Number.isFinite(value) ? (value as number).toFixed(3) : '—'

/** Review saved field inputs and the calculated single-run schedule. */
export function DrainageStep3Outputs({ data, projectId }: { data: DrainageData | null; projectId: string }) {
  const router = useRouter()
  const [savingSetout, setSavingSetout] = useState(false)
  const [setoutActionError, setSetoutActionError] = useState<string | null>(null)
  const [setoutCoordinateWarnings, setSetoutCoordinateWarnings] = useState<string[]>([])
  const [pendingDefinitionId, setPendingDefinitionId] = useState<string | null>(null)
  const manholes = data?.manholes || []
  const { runs: pipes, issues } = calculateProjectDrainageRuns(manholes)
  const { stations, issues: setoutIssues, warnings: setoutWarnings } = generateProjectDrainageSetout(data ?? { manholes: [] })

  const createFieldSetout = async () => {
    setSavingSetout(true)
    setSetoutActionError(null)
    setSetoutCoordinateWarnings([])
    setPendingDefinitionId(null)
    try {
      const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/setout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_drainage_definition' }),
      })
      const result = await response.json().catch(() => ({})) as {
        error?: string
        data?: { definitionId?: string; coordinateWarnings?: unknown }
      }
      if (!response.ok) throw new Error(result.error || 'Could not create field set-out targets.')
      if (!result.data?.definitionId) throw new Error('The set-out job was saved without a field definition ID.')
      const coordinateWarnings = Array.isArray(result.data.coordinateWarnings)
        ? result.data.coordinateWarnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
        : []
      if (coordinateWarnings.length > 0) {
        setSetoutCoordinateWarnings([...new Set(coordinateWarnings)])
        setPendingDefinitionId(result.data.definitionId)
        return
      }
      router.push(`/field/setout?projectId=${encodeURIComponent(projectId)}&definitionId=${encodeURIComponent(result.data.definitionId)}`)
    } catch (error) {
      setSetoutActionError(error instanceof Error ? error.message : 'Could not create field set-out targets.')
    } finally {
      setSavingSetout(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 text-lg font-semibold text-white">Drainage set-out review</h3>
        <p className="text-sm text-zinc-400">Review the saved manhole chainage and level schedule, calculated pipe gradients, and normal-depth screening against the circular open-channel peak. The screening does not establish intermediate cover, inlet/outlet control, HGL/backwater, surcharge at manholes, or design approval.</p>
      </div>

      <Link href={`/tools/pipeline-asbuilt?projectId=${encodeURIComponent(projectId)}`} className="inline-flex min-h-11 items-center rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-200">Record and review measured pipe as-built profiles</Link>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="overflow-x-auto rounded-lg border border-zinc-700 p-4">
          <h4 className="mb-3 font-medium text-white">Manhole level schedule</h4>
          {manholes.length === 0 ? <p className="text-sm text-zinc-500">Add manholes to see the schedule.</p> : (
            <table className="w-full min-w-[620px] text-sm">
              <thead><tr className="text-xs text-zinc-500">
                <th className="pb-2 text-left">Manhole</th><th className="pb-2 text-right">Chainage</th>
                <th className="pb-2 text-right">Easting</th><th className="pb-2 text-right">Northing</th>
                <th className="pb-2 text-right">Cover / GL</th><th className="pb-2 text-right">Invert in</th>
                <th className="pb-2 text-right">Invert out</th><th className="pb-2 text-right">Depth to out</th>
                <th className="pb-2 text-right">Pipe ID / OD</th>
              </tr></thead>
              <tbody>{manholes.map((manhole, index) => {
                const depth = Number.isFinite(manhole.coverLevel) && Number.isFinite(manhole.invertLevelOut)
                  ? (manhole.coverLevel as number) - (manhole.invertLevelOut as number)
                  : undefined
                return <tr key={`${manhole.id}-${index}`} className="border-t border-zinc-800">
                  <td className="py-1.5 text-white">{manhole.name || '—'}</td>
                  <td className="py-1.5 text-right text-zinc-300">{rl(manhole.chainage)}</td>
                  <td className="py-1.5 text-right text-zinc-300">{rl(manhole.easting)}</td>
                  <td className="py-1.5 text-right text-zinc-300">{rl(manhole.northing)}</td>
                  <td className="py-1.5 text-right text-zinc-300">{rl(manhole.coverLevel)}</td>
                  <td className="py-1.5 text-right text-zinc-300">{rl(manhole.invertLevelIn)}</td>
                  <td className="py-1.5 text-right text-zinc-300">{rl(manhole.invertLevelOut)}</td>
                  <td className="py-1.5 text-right text-zinc-300">{rl(depth)}</td>
                  <td className="py-1.5 text-right text-zinc-300">{manhole.pipeDiameterOut ?? '—'} / {manhole.pipeOutsideDiameterOut ?? '—'} mm</td>
                </tr>
              })}</tbody>
            </table>
          )}
        </section>

        <section className="overflow-x-auto rounded-lg border border-zinc-700 p-4">
          <h4 className="mb-3 font-medium text-white">Pipe run calculation</h4>
          {pipes.length === 0 ? <p className="text-sm text-zinc-500">Save a complete pipe run to see calculated values.</p> : (
            <table className="w-full min-w-[660px] text-sm">
              <thead><tr className="text-xs text-zinc-500">
                <th className="pb-2 text-left">Run</th><th className="pb-2 text-right">Length</th>
                <th className="pb-2 text-right">Gradient</th><th className="pb-2 text-right">ID</th>
                <th className="pb-2 text-right">n</th><th className="pb-2 text-right">Velocity</th>
                <th className="pb-2 text-right">Full-bore capacity</th><th className="pb-2 text-left">Design-flow screening</th>
              </tr></thead>
              <tbody>{pipes.map((pipe, index) => <tr key={`${pipe.fromMH}-${pipe.toMH}-${index}`} className="border-t border-zinc-800">
                <td className="py-1.5 text-white">{pipe.fromMH} → {pipe.toMH}</td>
                <td className="py-1.5 text-right text-zinc-300">{pipe.length.toFixed(3)} m</td>
                <td className="py-1.5 text-right text-zinc-300">{pipe.gradient.toFixed(3)}%</td>
                <td className="py-1.5 text-right text-zinc-300">{pipe.internalDiameterMm.toFixed(1)} mm</td>
                <td className="py-1.5 text-right text-zinc-300">{pipe.manningN.toFixed(3)}</td>
                <td className="py-1.5 text-right text-zinc-300">{pipe.velocity.toFixed(3)} m/s</td>
                <td className="py-1.5 text-right text-zinc-300">{(pipe.fullBoreCapacity * 1000).toFixed(2)} L/s</td>
                <td className="py-1.5 text-zinc-300"><PipeFlowScreening run={pipe} /></td>
              </tr>)}</tbody>
            </table>
          )}
        </section>
      </div>
      <section className="space-y-3 rounded-lg border border-zinc-700 p-4">
        <div>
          <h4 className="mb-1 font-medium text-white">Pipe invert and crown set-out schedule</h4>
          <p className="text-xs text-zinc-400">Invert is the bottom inside the pipe. For circular concentric pipes, outside crown = internal invert + (actual internal diameter + outside diameter) / 2000. Missing internal geometry leaves crown and cover unknown.</p>
          <p className="text-xs text-zinc-400">CRS: {data?.projectCrs || 'not set'} · {data?.setoutIntervalM ? `interval ${data.setoutIntervalM} m` : 'interval not set'} · coordinates follow entered pipe alignment vertices; a straight run is used when none are entered.</p>
          <p className="mt-1 text-xs text-amber-200">Cover is checked only at manholes using the entered cover-top RL. Ground and cover at intermediate stations are not surveyed or inferred.</p>
        </div>
        {setoutWarnings.length > 0 && (
          <div role="status" className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
            Check the project CRS and source coordinates before field use:
            <ul className="mt-2 list-inside list-disc space-y-1">{setoutWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
          </div>
        )}
        {setoutIssues.length > 0 ? (
          <div role="status" className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
            Complete these project inputs before a construction set-out schedule is available:
            <ul className="mt-2 list-inside list-disc space-y-1">{setoutIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>
          </div>
        ) : (
          <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-xs text-zinc-400">Create a revisioned field job from the saved engineering record. The server recalculates the station list and checks that its CRS matches the project declaration.</p>
            <button type="button" onClick={() => void createFieldSetout()} disabled={savingSetout || stations.length === 0} className="rounded bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:cursor-wait disabled:opacity-60">
              {savingSetout ? 'Preparing field job…' : 'Create / refresh field set-out'}
            </button>
          </div>
          {setoutActionError && <p role="alert" className="rounded border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{setoutActionError}</p>}
          {setoutCoordinateWarnings.length > 0 && (
            <div role="alert" className="space-y-3 rounded border border-amber-600 bg-amber-950/60 p-3 text-sm text-amber-100">
              <p>The field job was saved, but coordinate validation raised a warning. Verify the project CRS and source coordinates before opening it or staking any targets.</p>
              <ul className="list-inside list-disc space-y-1">{setoutCoordinateWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
              {pendingDefinitionId && (
                <button
                  type="button"
                  onClick={() => router.push(`/field/setout?projectId=${encodeURIComponent(projectId)}&definitionId=${encodeURIComponent(pendingDefinitionId)}`)}
                  className="rounded border border-amber-300 px-3 py-2 font-semibold text-amber-50 hover:bg-amber-900/50"
                >
                  Open field job after review
                </button>
              )}
            </div>
          )}
          <div className="max-h-96 overflow-auto rounded border border-zinc-800">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="sticky top-0 bg-zinc-800 text-xs text-zinc-300"><tr>
                <th className="px-3 py-2 text-left">Pipe</th><th className="px-3 py-2 text-left">Station</th>
                <th className="px-3 py-2 text-right">Chainage</th><th className="px-3 py-2 text-right">Easting</th>
                <th className="px-3 py-2 text-right">Northing</th><th className="px-3 py-2 text-right">Invert RL</th>
                <th className="px-3 py-2 text-right">Crown RL</th><th className="px-3 py-2 text-right">Cover</th>
                <th className="px-3 py-2 text-left">Cover check</th>
              </tr></thead>
              <tbody>{stations.map((station, index) => <tr key={`${station.pipeId}-${station.pipeChainageM}-${index}`} className="border-t border-zinc-800">
                <td className="px-3 py-2 text-white">{station.pipeId}</td>
                <td className="px-3 py-2 text-zinc-300">{station.stationRole}</td>
                <td className="px-3 py-2 text-right text-zinc-300">{station.runChainageM.toFixed(3)}</td>
                <td className="px-3 py-2 text-right text-zinc-300">{station.easting.toFixed(3)}</td>
                <td className="px-3 py-2 text-right text-zinc-300">{station.northing.toFixed(3)}</td>
                <td className="px-3 py-2 text-right text-zinc-300">{station.invertLevelM.toFixed(3)}</td>
                <td className="px-3 py-2 text-right text-zinc-300">{rl(station.crownLevelM)}</td>
                <td className="px-3 py-2 text-right text-zinc-300">{rl(station.coverAboveCrownM)}</td>
                <td className="px-3 py-2 text-zinc-300">{station.coverAssessment}</td>
              </tr>)}</tbody>
            </table>
          </div>
          </>
        )}
      </section>
      {issues.length > 0 && <div role="status" className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">Pipe calculations are not current because the required inputs are incomplete. Correct the manhole inputs in the previous steps. {issues.join(' ')}</div>}
      <p className="text-xs text-zinc-500">Full-bore Manning values are preliminary calculations. Set-out coordinates follow the entered plan alignment and design invert levels are interpolated linearly between manholes; verify the route, pipe product, work tolerances, flow assumptions, connection drops, trench/bedding design, utility clashes, intermediate ground cover, and applicable project criteria before construction issue.</p>
    </div>
  )
}
