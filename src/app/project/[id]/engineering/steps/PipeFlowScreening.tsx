import type { PipeRun } from '@/types/engineering'

export function PipeFlowScreening({ run }: { run: PipeRun }) {
  const pressureFlowRequired = run.partialFlow?.flowCondition === 'Pressure flow analysis required'
  const tone = pressureFlowRequired
    ? 'text-purple-200'
    : run.capacityStatus === 'Above full-bore rate; near-crown free-surface flow'
      ? 'text-amber-200'
      : run.capacityStatus === 'Within supplied full-bore capacity'
        ? 'text-emerald-200'
        : 'text-zinc-300'

  return (
    <div className="space-y-1">
      <p className={tone}>
        {run.designFlowLs === undefined
          ? run.capacityStatus
          : `${run.capacityStatus} (${run.designFlowLs.toFixed(2)} L/s)`}
      </p>
      {run.partialFlow && (
        pressureFlowRequired ? (
          <p className="text-xs text-zinc-400">
            Open-channel maximum: {run.partialFlow.maxFreeSurfaceCapacityLs.toFixed(1)} L/s. Free-surface depth and Froude number are not assessed; complete pressure-flow and hydraulic-grade-line analysis.
          </p>
        ) : (
          <p className="text-xs text-zinc-400">
            Uniform-flow normal-depth estimate: {run.partialFlow.flowDepthMm} mm ({(run.partialFlow.depthRatio * 100).toFixed(1)}% D); mean velocity {run.partialFlow.actualVelocity.toFixed(2)} m/s; Fr {run.partialFlow.froudeNumber === null ? 'not assessed' : run.partialFlow.froudeNumber.toFixed(2)} ({run.partialFlow.regime}). Open-channel maximum: {run.partialFlow.maxFreeSurfaceCapacityLs.toFixed(1)} L/s.
          </p>
        )
      )}
    </div>
  )
}
