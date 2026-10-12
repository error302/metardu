import { manningPipeCapacity, MANNING_N } from './drainageDesign'
import type { DrainageData, Manhole, PipeMaterial, PipeRun } from '@/types/engineering'
import { assertProjectedCrs, resolveEpsg, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { isDrainageMapAlignmentSource } from './drainageAlignment'
import {
  solvePartialFlow,
  generatePipeSetoutStations,
  type Manhole as NetworkManhole,
  type Pipe as NetworkPipe,
  type PipeSetoutStation,
} from './pipeNetworkEngine'

const materialRoughness: Record<PipeMaterial, number> = {
  Concrete: MANNING_N['Concrete pipe'],
  HDPE: MANNING_N.HDPE,
  uPVC: MANNING_N.uPVC,
  VCP: MANNING_N.VCP,
}

export interface ProjectDrainageCalculation {
  runs: PipeRun[]
  issues: string[]
}

export interface ProjectDrainageSetoutStation extends PipeSetoutStation {
  coverAssessment: 'Not assessed between surveyed manholes' | 'Daylight at measured manhole' | 'Below entered criterion at measured manhole' | 'Meets entered criterion at measured manhole'
}

export interface ProjectDrainageSetout {
  stations: ProjectDrainageSetoutStation[]
  issues: string[]
  warnings: string[]
}

/** Grade of the generated design alignment; it does not assess observed fall. */
export function drainagePipeGradeContext(stations: ProjectDrainageSetoutStation[]) {
  const ends = new Map<string, { start?: ProjectDrainageSetoutStation; end?: ProjectDrainageSetoutStation }>()
  for (const station of stations) {
    const pipe = ends.get(station.pipeId) ?? {}
    if (station.stationRole === 'Pipe start') pipe.start = station
    if (station.stationRole === 'Pipe end') pipe.end = station
    ends.set(station.pipeId, pipe)
  }
  const grades = new Map<string, { pipeLengthM: number; pipeFallM: number; pipeGradientPercent: number }>()
  for (const [pipeId, { start, end }] of ends) {
    if (!start || !end) continue
    const pipeLengthM = end.pipeChainageM - start.pipeChainageM
    const pipeFallM = start.invertLevelM - end.invertLevelM
    if (![pipeLengthM, pipeFallM].every(Number.isFinite) || pipeLengthM <= 0 || pipeFallM <= 0) continue
    const pipeGradientPercent = pipeFallM / pipeLengthM * 100
    if (Number.isFinite(pipeGradientPercent)) grades.set(pipeId, { pipeLengthM, pipeFallM, pipeGradientPercent })
  }
  return grades
}

/**
 * Prepare projected-coordinate invert/crown set-out levels for a saved
 * drainage run. The CRS must be registered and metre-based; intermediate
 * alignment vertices are followed when supplied, while ground and cover remain
 * unknown because only manhole levels are surveyed.
 */
export function generateProjectDrainageSetout(data: DrainageData): ProjectDrainageSetout {
  const issues: string[] = []
  const warnings = new Set<string>()
  let projectCrsCode: string | null = null
  if (!Array.isArray(data.manholes)) {
    return { stations: [], issues: ['Saved drainage data has no valid manhole list.'], warnings: [] }
  }
  if (data.manholes.length < 2) {
    issues.push('Add at least two named manholes before creating a pipe set-out schedule.')
  }
  if (!data.projectCrs?.trim()) issues.push('Enter the project CRS before creating coordinate set-out values.')
  else {
    try {
      const crs = assertProjectedCrs(data.projectCrs)
      projectCrsCode = crs.code
      if (crs.units !== 'metres') issues.push(`${crs.code} is not expressed in metres; set-out requires projected metre coordinates.`)
    } catch (error) {
      issues.push(error instanceof Error ? error.message : 'The project CRS is not valid for set-out.')
    }
  }
  if (!Number.isFinite(data.minimumCoverM) || (data.minimumCoverM as number) <= 0) {
    issues.push('Enter a positive minimum cover criterion from the approved project specification before checking set-out cover.')
  }
  if (!Number.isFinite(data.setoutIntervalM) || (data.setoutIntervalM as number) <= 0) {
    issues.push('Enter a positive set-out interval in metres.')
  }

  const networkManholes: NetworkManhole[] = data.manholes.map(manhole => ({
    id: manhole.id,
    easting: manhole.easting,
    northing: manhole.northing,
    groundLevel: manhole.coverLevel,
    invertIn: manhole.invertLevelIn,
    invertOut: manhole.invertLevelOut,
  }))
  const networkPipes: NetworkPipe[] = data.manholes.slice(0, -1).map((manhole, index) => {
    const downstream = data.manholes[index + 1]
    return {
      id: `${manhole.name}-${downstream.name}`,
      fromId: manhole.id,
      toId: downstream.id,
      diameterMm: manhole.pipeDiameterOut ?? 0,
      outsideDiameterMm: manhole.pipeOutsideDiameterOut,
      material: manhole.pipeMaterial === 'VCP' ? 'Concrete' : manhole.pipeMaterial ?? 'Concrete',
      manningN: manhole.pipeManningN ?? materialRoughness[manhole.pipeMaterial ?? 'Concrete'],
      designFlowLs: manhole.designFlowOutLs ?? 0,
      alignmentVertices: manhole.alignmentVerticesOut ?? [],
    }
  })

  const names = new Set<string>()
  data.manholes.forEach((manhole, index) => {
    const label = manhole.name.trim() || `Manhole ${index + 1}`
    if (manhole.alignmentSourceOut !== undefined) {
      const source = manhole.alignmentSourceOut as unknown
      if (!isDrainageMapAlignmentSource(source)) {
        issues.push(`${label}: saved map alignment provenance is invalid; reselect the map line before set-out.`)
      } else {
        let sourceCrs: string | null = null
        try {
          sourceCrs = resolveEpsg(source.projectCrs).code
        } catch {
          issues.push(`${label}: the project CRS stored with the map alignment is no longer supported; reselect the map line.`)
        }
        if (projectCrsCode && sourceCrs && sourceCrs !== projectCrsCode) {
          issues.push(`${label}: saved map alignment coordinates use ${sourceCrs}, but drainage set-out uses ${projectCrsCode}; reselect the line under the current project CRS.`)
        }
        if (index === data.manholes.length - 1) {
          issues.push(`${label}: a saved map alignment must be attached to a pipe with a downstream manhole.`)
        } else if (sourceCrs) {
          const downstreamName = data.manholes[index + 1]?.name || `Manhole ${index + 2}`
          const editNote = source.editedAfterImport ? ' The vertices were edited after import.' : ''
          warnings.add(
            `${label}→${downstreamName} uses saved map line “${source.label}”, transformed from ${source.sourceCrs} to ${source.projectCrs}; this map drawing is not verified design or survey control. Confirm it against the approved design and survey control before construction. Manhole-to-line endpoint connectors are ${source.startConnectorM.toFixed(3)} m and ${source.endConnectorM.toFixed(3)} m.${editNote}`,
          )
        }
      }
    }
    if (!manhole.name.trim()) issues.push(`${label}: enter a name.`)
    else if (names.has(manhole.name.trim())) issues.push(`Manhole name “${manhole.name.trim()}” is duplicated.`)
    names.add(manhole.name.trim())
    if (!Number.isFinite(manhole.chainage)) issues.push(`${label}: enter the surveyed/design chainage.`)
    if (index > 0 && Number.isFinite(manhole.chainage) && Number.isFinite(data.manholes[index - 1]?.chainage)
      && (manhole.chainage as number) <= (data.manholes[index - 1].chainage as number)) {
      issues.push(`${label}: chainage must increase downstream.`)
    }
    if (!Number.isFinite(manhole.easting) || !Number.isFinite(manhole.northing)) {
      issues.push(`${label}: enter projected Easting and Northing coordinates in metres.`)
    } else if (projectCrsCode) {
      const coordinateCheck = validateCoordinateRange(manhole.easting as number, manhole.northing as number, projectCrsCode)
      if (!coordinateCheck.valid) issues.push(`${label}: ${coordinateCheck.errors.join('; ')}`)
      coordinateCheck.warnings.forEach(warning => warnings.add(warning))
    }
    if (index < data.manholes.length - 1) {
      const downstreamManhole = data.manholes[index + 1]
      if (!Number.isFinite(manhole.invertLevelOut)) issues.push(`${label}: enter the upstream outgoing invert RL.`)
      if (!Number.isFinite(downstreamManhole?.invertLevelIn)) {
        issues.push(`${downstreamManhole?.name || `Manhole ${index + 2}`}: enter the downstream incoming invert RL.`)
      } else if (Number.isFinite(manhole.invertLevelOut)
        && (manhole.invertLevelOut as number) <= (downstreamManhole.invertLevelIn as number)) {
        issues.push(`${label}→${downstreamManhole?.name || `Manhole ${index + 2}`}: upstream invert must fall downstream for gravity pipe set-out.`)
      }
      if (!Number.isFinite(manhole.pipeOutsideDiameterOut) || (manhole.pipeOutsideDiameterOut as number) <= 0) {
        issues.push(`${label}: enter the manufacturer's outside diameter for the outgoing pipe.`)
      }
    }
    const downstream = data.manholes[index + 1]
    if (downstream && Number.isFinite(manhole.chainage) && Number.isFinite(downstream.chainage)
      && Number.isFinite(manhole.easting) && Number.isFinite(manhole.northing)
      && Number.isFinite(downstream.easting) && Number.isFinite(downstream.northing)) {
      const routeVertices = manhole.alignmentVerticesOut ?? []
      if (!Array.isArray(routeVertices)) {
        issues.push(`${label}: outgoing alignment vertices must be a list of projected coordinate pairs.`)
        return
      }
      let alignmentLength = 0
      let previous = { easting: manhole.easting as number, northing: manhole.northing as number }
      let validAlignment = true
      for (const [vertexIndex, vertex] of routeVertices.entries()) {
        if (!vertex || !Number.isFinite(vertex.easting) || !Number.isFinite(vertex.northing)) {
          issues.push(`${label}: alignment vertex ${vertexIndex + 1} must have finite projected Easting and Northing.`)
          validAlignment = false
          continue
        }
        if (projectCrsCode) {
          const coordinateCheck = validateCoordinateRange(vertex.easting, vertex.northing, projectCrsCode)
          if (!coordinateCheck.valid) {
            issues.push(`${label}: alignment vertex ${vertexIndex + 1}: ${coordinateCheck.errors.join('; ')}`)
            validAlignment = false
          }
          coordinateCheck.warnings.forEach(warning => warnings.add(warning))
        }
        const segmentLength = Math.hypot(vertex.easting - previous.easting, vertex.northing - previous.northing)
        if (!Number.isFinite(segmentLength) || segmentLength <= 1e-9) {
          issues.push(`${label}: consecutive outgoing alignment coordinates must be distinct.`)
          validAlignment = false
        } else {
          alignmentLength += segmentLength
        }
        previous = { easting: vertex.easting, northing: vertex.northing }
      }
      const finalSegmentLength = Math.hypot(
        (downstream.easting as number) - previous.easting,
        (downstream.northing as number) - previous.northing,
      )
      if (!Number.isFinite(finalSegmentLength) || finalSegmentLength <= 1e-9) {
        issues.push(`${label}: the final outgoing alignment segment to ${downstream.name || `Manhole ${index + 2}`} must have positive length.`)
        validAlignment = false
      } else {
        alignmentLength += finalSegmentLength
      }
      if (!validAlignment) return
      const chainageLength = (downstream.chainage as number) - (manhole.chainage as number)
      const allowedDifference = Math.max(0.05, alignmentLength * 0.001)
      if (Math.abs(chainageLength - alignmentLength) > allowedDifference) {
        issues.push(`${label}→${downstream.name || `Manhole ${index + 2}`}: chainage interval differs from the entered pipe alignment length by ${Math.abs(chainageLength - alignmentLength).toFixed(3)} m; reconcile the route geometry before set-out.`)
      }
    }
  })

  if (issues.length > 0) return { stations: [], issues: [...new Set(issues)], warnings: [...warnings] }

  try {
    const stations = generatePipeSetoutStations(
      networkManholes,
      networkPipes,
      data.setoutIntervalM as number,
      data.setoutStartChainageM ?? data.manholes[0]?.chainage ?? 0,
      { requireDiameter: false, requireDesignFlow: false, requireInverts: false },
    ).map(station => ({
      ...station,
      coverAssessment: station.groundLevelM === undefined || station.coverAboveCrownM === undefined
        ? 'Not assessed between surveyed manholes' as const
        : station.coverAboveCrownM < 0
          ? 'Daylight at measured manhole' as const
          : station.coverAboveCrownM < (data.minimumCoverM as number)
            ? 'Below entered criterion at measured manhole' as const
            : 'Meets entered criterion at measured manhole' as const,
    }))
    for (const [index, station] of stations.entries()) {
      const coordinateCheck = validateCoordinateRange(station.easting, station.northing, projectCrsCode as string)
      if (!coordinateCheck.valid) {
        issues.push(`DR-${String(index + 1).padStart(5, '0')}: ${coordinateCheck.errors.join('; ')}`)
      }
      coordinateCheck.warnings.forEach(warning => warnings.add(warning))
    }
    return issues.length > 0
      ? { stations: [], issues: [...new Set(issues)], warnings: [...warnings] }
      : { stations, issues: [], warnings: [...warnings] }
  } catch (error) {
    return {
      stations: [],
      issues: [error instanceof Error ? error.message : 'Drainage set-out could not be generated.'],
      warnings: [...warnings],
    }
  }
}

/** Calculate one ordered manhole run. Incomplete or adverse inputs stay visible as issues. */
export function calculateProjectDrainageRuns(manholes: Manhole[]): ProjectDrainageCalculation {
  const issues: string[] = []
  const runs: PipeRun[] = []
  const names = new Set<string>()

  if (manholes.length < 2) return { runs, issues: ['Add at least two manholes to calculate a pipe run.'] }

  manholes.forEach((manhole, index) => {
    const name = manhole.name.trim()
    if (!name) issues.push(`Manhole ${index + 1}: enter a name.`)
    else if (names.has(name)) issues.push(`Manhole name “${name}” is duplicated.`)
    names.add(name)
    if (!Number.isFinite(manhole.chainage)) issues.push(`${name || `Manhole ${index + 1}`}: enter the surveyed/design chainage; spacing is not assumed.`)
  })

  for (let index = 0; index < manholes.length - 1; index += 1) {
    const from = manholes[index]
    const to = manholes[index + 1]
    const fromLabel = from.name.trim() || `Manhole ${index + 1}`
    const toLabel = to.name.trim() || `Manhole ${index + 2}`
    let invalidRun = false
    if (!Number.isFinite(from.chainage) || !Number.isFinite(to.chainage)) {
      invalidRun = true
    } else if ((to.chainage as number) <= (from.chainage as number)) {
      issues.push(`${fromLabel}→${toLabel}: chainage must increase downstream.`)
      invalidRun = true
    }
    if (!Number.isFinite(from.invertLevelOut)) {
      issues.push(`${fromLabel}→${toLabel}: enter the upstream outgoing invert level.`)
      invalidRun = true
    }
    if (!Number.isFinite(to.invertLevelIn)) {
      issues.push(`${fromLabel}→${toLabel}: enter the downstream incoming invert level.`)
      invalidRun = true
    }
    if (!Number.isFinite(from.pipeDiameterOut) || (from.pipeDiameterOut as number) <= 0) {
      issues.push(`${fromLabel}→${toLabel}: enter the pipe's hydraulic internal diameter.`)
      invalidRun = true
    }
    if (!from.pipeMaterial || !(from.pipeMaterial in materialRoughness)) {
      issues.push(`${fromLabel}→${toLabel}: select the pipe material and verify its roughness value.`)
      invalidRun = true
    }
    if (from.pipeManningN !== undefined && (!Number.isFinite(from.pipeManningN) || from.pipeManningN <= 0)) {
      issues.push(`${fromLabel}→${toLabel}: Manning roughness must be finite and greater than zero.`)
      invalidRun = true
    }
    if (from.designFlowOutLs !== undefined && (!Number.isFinite(from.designFlowOutLs) || from.designFlowOutLs < 0)) {
      issues.push(`${fromLabel}→${toLabel}: design flow must be finite and non-negative when supplied.`)
      invalidRun = true
    }
    if (invalidRun) continue

    const length = (to.chainage as number) - (from.chainage as number)

    const fall = (from.invertLevelOut as number) - (to.invertLevelIn as number)
    const slope = fall / length
    if (slope <= 0) {
      issues.push(`${fromLabel}→${toLabel}: outgoing upstream invert must be above the downstream incoming invert for gravity-flow calculations.`)
      continue
    }

    const internalDiameterMm = from.pipeDiameterOut as number
    const material = from.pipeMaterial as PipeMaterial
    const manningN = from.pipeManningN ?? materialRoughness[material]
    const capacity = manningPipeCapacity({
      diameter: internalDiameterMm,
      manningN,
      slope,
    })
    const networkMaterial = material === 'VCP' ? 'Concrete' : material
    const partialFlow = from.designFlowOutLs === undefined
      ? undefined
      : solvePartialFlow(internalDiameterMm, slope, networkMaterial, from.designFlowOutLs, manningN)
    const capacityStatus: PipeRun['capacityStatus'] = from.designFlowOutLs === undefined
      ? 'No design flow supplied'
      : partialFlow?.flowCondition === 'Pressure flow analysis required'
        ? 'Exceeds open-channel capacity; pressure-flow analysis required'
        : from.designFlowOutLs > capacity.fullBoreCapacity * 1000 * (1 + 1e-12)
          ? 'Above full-bore rate; near-crown free-surface flow'
          : 'Within supplied full-bore capacity'

    runs.push({
      fromMH: from.name,
      toMH: to.name,
      length,
      gradient: slope * 100,
      velocity: capacity.fullBoreVelocity,
      fullBoreCapacity: capacity.fullBoreCapacity,
      gradientStatus: 'POSITIVE',
      internalDiameterMm,
      material,
      manningN,
      designFlowLs: from.designFlowOutLs,
      partialFlow,
      capacityStatus,
    })
  }

  return { runs, issues: [...new Set(issues)] }
}

export function validateProjectDrainageData(data: DrainageData): string[] {
  return calculateProjectDrainageRuns(data.manholes).issues
}
