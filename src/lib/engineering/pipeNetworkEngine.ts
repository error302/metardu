/**
 * Pipe Network / Storm Drainage & Sewer Modeling Engine
 * Implements Manning's Equation for full & partial gravity flow,
 * uniform-flow depth estimates, measured cover checks, drop manholes,
 * Rational Method runoff calculation, and AutoCAD DXF export.
 * These are engineering calculations, not a standards-compliance certificate.
 */

export interface Manhole {
  id: string;
  easting?: number;
  northing?: number;
  groundLevel?: number;
  invertIn?: number;
  invertOut?: number;
  /** User-supplied local-loss coefficient for the junction; required for pressure HGL between reaches. */
  junctionLossK?: number;
}

export interface Pipe {
  id: string;
  fromId: string;
  toId: string;
  diameterMm: number;
  /** Manufacturer outside diameter used for crown, cover and physical profile. */
  outsideDiameterMm?: number;
  material: 'Concrete' | 'HDPE' | 'uPVC' | 'Corrugated Metal';
  /** Optional project-specified roughness; omitted uses the material's screening preset. */
  manningN?: number;
  designFlowLs: number; // L/s
  /** Optional intermediate plan vertices in projected metres, excluding manhole endpoints. */
  alignmentVertices?: Array<{ easting: number; northing: number }>;
}

export interface PipeCover {
  coverUpstream?: number; // m
  coverDownstream?: number; // m
  minCover?: number; // m
  status: 'Not Assessed' | 'Meets Criterion' | 'Below Criterion' | 'Daylight';
  requiredCoverM?: number;
  message: string;
}

export interface PartialFlowResult {
  depthRatio: number; // d/D (0.0 to 1.0)
  flowDepthMm: number; // mm
  actualVelocity: number; // m/s
  /** Maximum uniform free-surface discharge for this diameter, slope and roughness. */
  maxFreeSurfaceCapacityLs: number;
  flowCondition: 'Free surface' | 'Pressure flow analysis required';
  froudeNumber: number | null;
  regime: 'Subcritical' | 'Critical' | 'Supercritical' | 'Not assessed';
}

export interface PipeResult extends Pipe {
  horizontalLengthM: number;
  slope: number; // m/m
  slopePercent: number; // %
  velocity: number; // Full-pipe velocity (m/s)
  capacityLs: number; // Full-pipe capacity (L/s)
  status: 'Within Screening Range' | 'Outside Screening Range' | 'Near-Crown Free-Surface Flow' | 'Open-Channel Capacity Exceeded';
  partial: PartialFlowResult;
  cover: PipeCover;
}

/** Keep free-surface capacity and velocity screening classifications in the engineering engine. */
export function classifyPipeFlowStatus(
  designFlowLs: number,
  fullPipeCapacityLs: number,
  partial: PartialFlowResult,
): PipeResult['status'] {
  if (partial.flowCondition === 'Pressure flow analysis required') return 'Open-Channel Capacity Exceeded'
  if (designFlowLs > fullPipeCapacityLs * (1 + 1e-12)) return 'Near-Crown Free-Surface Flow'
  if (partial.actualVelocity < 0.75 || partial.actualVelocity > 3.0) return 'Outside Screening Range'
  return 'Within Screening Range'
}

export interface ManholeDropAnalysis {
  manholeId: string;
  dropM: number; // invertIn - invertOut
  type: 'Continuous' | 'Positive Step' | 'Adverse Step' | 'Terminal' | 'Inlet';
  note: string;
}

export const MANNING_N = {
  'Concrete': 0.013,
  'HDPE': 0.010,
  'uPVC': 0.009,
  'Corrugated Metal': 0.024,
};

export const STANDARD_DIAMETERS = [150, 200, 225, 300, 375, 450, 525, 600, 750, 900, 1050, 1200, 1500];

export interface PipeNetworkValidationOptions {
  /** Auto-grading may create inverts, so it validates the rest of the inputs first. */
  requireInverts?: boolean;
  /** Set false when working on geometry before a hydraulic flow is available. */
  requireDesignFlow?: boolean;
  /** Diameter sizing can run before the hydraulic internal diameter is selected. */
  requireDiameter?: boolean;
}

// Manning's circular-section relation peaks before the pipe reaches its crown.
// The exact dimensionless maximum is at y/D=0.93818121849 and is
// Q/Qfull=1.07570612940. FHWA HEC-22 (4th ed., 2024), ch. 9, describes the
// same design fact as peak flow near 93% depth; full-flow sizing is conservative.
const MAX_FREE_SURFACE_FLOW_RATIO = 1.0757061294004646
const MAX_FREE_SURFACE_THETA_RAD = 5.278107157282392

export interface PipeSetoutStation {
  pipeId: string;
  stationRole: 'Pipe start' | 'Intermediate' | 'Pipe end';
  pipeChainageM: number;
  runChainageM: number;
  easting: number;
  northing: number;
  invertLevelM: number;
  crownLevelM: number;
  groundLevelM?: number;
  coverAboveCrownM?: number;
  groundStatus: 'Measured at manhole' | 'Not surveyed at intermediate station';
}

export const MAX_PIPE_SETOUT_STATIONS = 20_000
// Keep requested spacing above alignmentStationDistances' duplicate tolerance.
const MIN_PIPE_SETOUT_INTERVAL_M = 1e-8

/** Validate calculation inputs without inventing missing survey or design values. */
export function validatePipeNetwork(
  manholes: Manhole[],
  pipes: Pipe[],
  options: PipeNetworkValidationOptions = {},
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const byId = new Map<string, Manhole>();
  const incomingPipeIds = new Set(pipes.map(pipe => pipe.toId));
  const outgoingPipeIds = new Set(pipes.map(pipe => pipe.fromId));

  if (manholes.length < 2) issues.push('Add at least two manholes with surveyed coordinates and ground levels.');
  if (pipes.length === 0) issues.push('Add at least one pipe segment.');

  manholes.forEach((mh, index) => {
    const label = mh.id?.trim() || `Manhole ${index + 1}`;
    if (!mh.id?.trim()) issues.push(`${label} needs an identifier.`);
    else if (ids.has(mh.id.trim())) issues.push(`Manhole identifier “${mh.id.trim()}” is duplicated.`);
    ids.add(mh.id.trim());
    byId.set(mh.id, mh);

    if (!Number.isFinite(mh.easting) || !Number.isFinite(mh.northing)) {
      issues.push(`${label}: enter finite projected Easting and Northing coordinates in metres.`);
    }
    if (!Number.isFinite(mh.groundLevel)) issues.push(`${label}: enter a surveyed/design ground level.`);
    if (mh.junctionLossK !== undefined && (!Number.isFinite(mh.junctionLossK) || mh.junctionLossK < 0)) {
      issues.push(`${label}: junction loss K must be finite and non-negative.`);
    }
    if (options.requireInverts !== false) {
      if (!Number.isFinite(mh.invertIn) && incomingPipeIds.has(mh.id)) issues.push(`${label}: enter the incoming pipe invert.`);
      if (!Number.isFinite(mh.invertOut) && outgoingPipeIds.has(mh.id)) issues.push(`${label}: enter the outgoing pipe invert.`);
    }
  });

  const pipeIds = new Set<string>();
  pipes.forEach((pipe, index) => {
    const label = pipe.id?.trim() || `Pipe ${index + 1}`;
    if (!pipe.id?.trim()) issues.push(`${label} needs an identifier.`);
    else if (pipeIds.has(pipe.id.trim())) issues.push(`Pipe identifier “${pipe.id.trim()}” is duplicated.`);
    pipeIds.add(pipe.id.trim());

    const from = byId.get(pipe.fromId);
    const to = byId.get(pipe.toId);
    if (!from || !to) {
      issues.push(`${label}: select existing upstream and downstream manholes.`);
      return;
    }
    if (pipe.fromId === pipe.toId) issues.push(`${label}: upstream and downstream manholes must differ.`);
    if (options.requireDiameter !== false && (!Number.isFinite(pipe.diameterMm) || pipe.diameterMm <= 0)) {
      issues.push(`${label}: hydraulic internal diameter must be greater than zero.`);
    }
    if (pipe.manningN !== undefined && (!Number.isFinite(pipe.manningN) || pipe.manningN <= 0)) {
      issues.push(`${label}: Manning roughness must be finite and greater than zero.`);
    }
    if (options.requireDesignFlow !== false && (!Number.isFinite(pipe.designFlowLs) || pipe.designFlowLs <= 0)) {
      issues.push(`${label}: enter a design flow greater than zero.`);
    }

    if (Number.isFinite(from.easting) && Number.isFinite(from.northing) && Number.isFinite(to.easting) && Number.isFinite(to.northing)) {
      const chordLength = Math.hypot((to.easting as number) - (from.easting as number), (to.northing as number) - (from.northing as number));
      if (chordLength <= 1e-9) {
        issues.push(`${label}: the two manholes have coincident plan coordinates.`);
      } else {
        try {
          const routeLength = calculatePipeAlignmentLengthM(pipe, from, to);
          if (options.requireInverts !== false && Number.isFinite(from.invertOut) && Number.isFinite(to.invertIn)
            && ((from.invertOut as number) - (to.invertIn as number)) / routeLength <= 0) {
            issues.push(`${label}: downstream invert must be lower than upstream invert for gravity-flow calculations.`);
          }
        } catch (error) {
          issues.push(error instanceof Error ? error.message : `${label}: pipe alignment is invalid.`);
        }
      }
    }
  });

  return [...new Set(issues)];
}

/** Profile output is supported for one ordered, unbranched run. */
export function validateLinearPipeRoute(
  manholes: Manhole[],
  pipes: Pipe[],
  options: PipeNetworkValidationOptions = {},
): string[] {
  const issues = validatePipeNetwork(manholes, pipes, options);
  if (pipes.length !== Math.max(0, manholes.length - 1)) {
    issues.push('Longitudinal profile output requires one continuous, unbranched run with one pipe between each adjacent manhole.');
  } else {
    for (let i = 0; i < pipes.length; i += 1) {
      if (pipes[i].fromId !== manholes[i]?.id || pipes[i].toId !== manholes[i + 1]?.id) {
        issues.push('Order manholes and pipes from upstream to downstream before generating the longitudinal profile.');
        break;
      }
    }
  }
  return [...new Set(issues)];
}

interface PipeAlignment {
  vertices: Array<{ easting: number; northing: number }>;
  cumulativeLengths: number[];
  lengthM: number;
}

function buildPipeAlignment(pipe: Pipe, from: Manhole, to: Manhole): PipeAlignment {
  if (!Number.isFinite(from.easting) || !Number.isFinite(from.northing)
    || !Number.isFinite(to.easting) || !Number.isFinite(to.northing)) {
    throw new Error(`${pipe.id}: set-out requires finite projected manhole coordinates.`);
  }
  if (pipe.alignmentVertices !== undefined && !Array.isArray(pipe.alignmentVertices)) {
    throw new Error(`${pipe.id}: alignment vertices must be an array of projected coordinate pairs.`);
  }
  const vertices = [
    { easting: from.easting as number, northing: from.northing as number },
    ...(pipe.alignmentVertices ?? []),
    { easting: to.easting as number, northing: to.northing as number },
  ];
  const cumulativeLengths = [0];
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index];
    if (!vertex || !Number.isFinite(vertex.easting) || !Number.isFinite(vertex.northing)) {
      throw new Error(`${pipe.id}: alignment vertex ${index} must have finite projected Easting and Northing.`);
    }
    if (index === 0) continue;
    const previous = vertices[index - 1];
    const segmentLength = Math.hypot(vertex.easting - previous.easting, vertex.northing - previous.northing);
    if (!Number.isFinite(segmentLength) || segmentLength <= 1e-9) {
      throw new Error(`${pipe.id}: consecutive alignment coordinates must be distinct.`);
    }
    cumulativeLengths.push(cumulativeLengths[index - 1] + segmentLength);
  }
  const lengthM = cumulativeLengths[cumulativeLengths.length - 1];
  if (!Number.isFinite(lengthM) || lengthM <= 0) throw new Error(`${pipe.id}: alignment length must be positive.`);
  return { vertices, cumulativeLengths, lengthM };
}

/** Returns the developed horizontal route length used by profiles, grades and set-out stations. */
export function calculatePipeAlignmentLengthM(pipe: Pipe, from: Manhole, to: Manhole): number {
  return buildPipeAlignment(pipe, from, to).lengthM;
}

function alignmentPointAt(alignment: PipeAlignment, distanceM: number): { easting: number; northing: number } {
  const clampedDistance = Math.min(alignment.lengthM, Math.max(0, distanceM));
  for (let index = 1; index < alignment.cumulativeLengths.length; index += 1) {
    const segmentEnd = alignment.cumulativeLengths[index];
    if (clampedDistance <= segmentEnd || index === alignment.cumulativeLengths.length - 1) {
      const segmentStart = alignment.cumulativeLengths[index - 1];
      const fraction = (clampedDistance - segmentStart) / (segmentEnd - segmentStart);
      const start = alignment.vertices[index - 1];
      const end = alignment.vertices[index];
      return {
        easting: start.easting + (end.easting - start.easting) * fraction,
        northing: start.northing + (end.northing - start.northing) * fraction,
      };
    }
  }
  return alignment.vertices[alignment.vertices.length - 1];
}

function alignmentStationDistances(alignment: PipeAlignment, intervalM: number): number[] {
  const distances = [0, alignment.lengthM, ...alignment.cumulativeLengths.slice(1, -1)];
  const intervalCount = Math.ceil(alignment.lengthM / intervalM);
  for (let step = 1; step < intervalCount; step += 1) {
    const stationM = step * intervalM;
    if (stationM < alignment.lengthM - 1e-9) distances.push(stationM);
  }
  distances.sort((a, b) => a - b);
  const uniqueDistances: number[] = [];
  for (const distance of distances) {
    if (uniqueDistances.length === 0 || distance - uniqueDistances[uniqueDistances.length - 1] > 1e-8) {
      uniqueDistances.push(distance);
    }
  }
  return uniqueDistances;
}

/**
 * Interpolates set-out points along each entered pipe alignment. If no interior
 * vertices are supplied, the alignment is the straight line between manholes.
 * Intermediate ground and cover remain unset because they are not surveyed here.
 */
export function generatePipeSetoutStations(
  manholes: Manhole[],
  pipes: Pipe[],
  intervalM: number,
  chainageStartM = 0,
  validationOptions: PipeNetworkValidationOptions = {},
): PipeSetoutStation[] {
  if (!Number.isFinite(intervalM) || intervalM <= MIN_PIPE_SETOUT_INTERVAL_M) {
    throw new RangeError(`Set-out interval must be finite and greater than ${MIN_PIPE_SETOUT_INTERVAL_M} m so stations remain distinct at the supported coordinate precision.`);
  }
  if (!Number.isFinite(chainageStartM)) throw new RangeError('Chainage start must be finite.');
  if (manholes.length > MAX_PIPE_SETOUT_STATIONS + 1 || pipes.length > MAX_PIPE_SETOUT_STATIONS) {
    throw new RangeError(`Set-out route exceeds the ${MAX_PIPE_SETOUT_STATIONS.toLocaleString()}-pipe station schedule limit.`);
  }
  let alignmentVertexCount = 0;
  for (const pipe of pipes) {
    if (pipe.alignmentVertices !== undefined && !Array.isArray(pipe.alignmentVertices)) {
      throw new Error(`${pipe.id}: alignment vertices must be an array of projected coordinate pairs.`);
    }
    alignmentVertexCount += pipe.alignmentVertices?.length ?? 0;
    if (alignmentVertexCount > MAX_PIPE_SETOUT_STATIONS) {
      throw new RangeError(`Set-out route exceeds the ${MAX_PIPE_SETOUT_STATIONS.toLocaleString()}-vertex alignment limit.`);
    }
  }
  const issues = validateLinearPipeRoute(manholes, pipes, { requireDesignFlow: false, ...validationOptions });
  if (issues.length > 0) throw new Error(`Cannot generate set-out stations: ${issues.join(' ')}`);

  const alignments = pipes.map((pipe, index) => buildPipeAlignment(pipe, manholes[index], manholes[index + 1]))
  // Bound the raw interval candidates arithmetically before materializing them.
  // At this interval precision, each alignment vertex and endpoint can merge
  // with at most a small, fixed number of regular stations during de-duplication.
  const maximumRawIntervalCandidates = MAX_PIPE_SETOUT_STATIONS + alignmentVertexCount + 2 * pipes.length;
  let rawIntervalCandidateCount = 0;
  for (const alignment of alignments) {
    const intervalCount = Math.ceil(alignment.lengthM / intervalM);
    const candidatesForPipe = intervalCount - 1;
    if (!Number.isFinite(intervalCount) || candidatesForPipe > maximumRawIntervalCandidates - rawIntervalCandidateCount) {
      throw new RangeError(`Set-out would create more than ${MAX_PIPE_SETOUT_STATIONS.toLocaleString()} stations; the limit is ${MAX_PIPE_SETOUT_STATIONS.toLocaleString()}. Increase the interval or split the field package.`);
    }
    rawIntervalCandidateCount += Math.max(0, candidatesForPipe);
  }

  const stationDistancesByPipe = alignments.map(alignment => alignmentStationDistances(alignment, intervalM));
  const stationCount = stationDistancesByPipe.reduce((total, distances) => total + distances.length, 0);
  if (stationCount > MAX_PIPE_SETOUT_STATIONS) {
    throw new RangeError(`Set-out would create ${stationCount.toLocaleString()} stations; the limit is ${MAX_PIPE_SETOUT_STATIONS.toLocaleString()}. Increase the interval or split the field package.`);
  }

  const stations: PipeSetoutStation[] = [];
  let runOffsetM = 0;
  for (let index = 0; index < pipes.length; index += 1) {
    const pipe = pipes[index];
    const from = manholes[index];
    const to = manholes[index + 1];
    const alignment = alignments[index];
    const lengthM = alignment.lengthM;
    const fromInvert = from.invertOut as number;
    const toInvert = to.invertIn as number;
    const localStations = stationDistancesByPipe[index];

    localStations.forEach((pipeChainageM, pointIndex, orderedStations) => {
      const fraction = pipeChainageM / lengthM;
      const atStart = pointIndex === 0;
      const atEnd = pointIndex === orderedStations.length - 1;
      const groundLevelM = atStart ? from.groundLevel as number : atEnd ? to.groundLevel as number : undefined;
      const invertLevelM = fromInvert + (toInvert - fromInvert) * fraction;
      if (!Number.isFinite(pipe.outsideDiameterMm) || (pipe.outsideDiameterMm as number) <= 0) {
        throw new Error(`${pipe.id}: enter the manufacturer's outside diameter before generating physical set-out levels.`);
      }
      const crownLevelM = invertLevelM + (pipe.outsideDiameterMm as number) / 1000;
      const coordinate = alignmentPointAt(alignment, pipeChainageM);
      stations.push({
        pipeId: pipe.id,
        stationRole: atStart ? 'Pipe start' : atEnd ? 'Pipe end' : 'Intermediate',
        pipeChainageM,
        runChainageM: chainageStartM + runOffsetM + pipeChainageM,
        easting: coordinate.easting,
        northing: coordinate.northing,
        invertLevelM,
        crownLevelM,
        groundLevelM,
        coverAboveCrownM: groundLevelM === undefined ? undefined : groundLevelM - crownLevelM,
        groundStatus: groundLevelM === undefined ? 'Not surveyed at intermediate station' : 'Measured at manhole',
      });
    });
    runOffsetM += lengthM;
  }
  return stations;
}

/**
 * Calculates flow capacity using Manning's Equation for 100% full pipe gravity flow.
 * Q = (1/n) * A * R^(2/3) * S^(1/2)
 * @param diameterMm Internal diameter in mm
 * @param slope Slope in m/m
 * @param material Pipe material
 * @returns Capacity in m^3/s and Velocity in m/s
 */
export function calculatePipeHydraulics(
  diameterMm: number,
  slope: number,
  material: keyof typeof MANNING_N,
  roughnessOverride?: number,
): { capacity: number; velocity: number } {
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) throw new RangeError('Pipe diameter must be a finite value greater than zero.');
  if (!Number.isFinite(slope) || slope <= 0) throw new RangeError('Pipe slope must be finite and positive in the flow direction.');
  const d = diameterMm / 1000;
  const n = roughnessOverride ?? MANNING_N[material];
  if (!Number.isFinite(n) || n <= 0) throw new RangeError('Manning roughness must be finite and greater than zero.');
  const a = (Math.PI * d * d) / 4;
  const r = d / 4;
  const v = (1 / n) * Math.pow(r, 2 / 3) * Math.sqrt(slope);
  const q = a * v;
  return { capacity: q, velocity: v };
}

/**
 * Solves circular pipe partial flow depth (d/D) and actual velocity using Manning's equation
 * and circular segment geometry via bisection.
 */
export function solvePartialFlow(
  diameterMm: number,
  slope: number,
  material: keyof typeof MANNING_N,
  designFlowLs: number,
  roughnessOverride?: number,
): PartialFlowResult {
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) throw new RangeError('Pipe diameter must be a finite value greater than zero.');
  if (!Number.isFinite(slope) || slope <= 0) throw new RangeError('Pipe slope must be finite and positive in the flow direction.');
  if (!Number.isFinite(designFlowLs) || designFlowLs < 0) throw new RangeError('Design flow must be finite and non-negative.');
  const d = diameterMm / 1000;
  const n = roughnessOverride ?? MANNING_N[material];
  if (!Number.isFinite(n) || n <= 0) throw new RangeError('Manning roughness must be finite and greater than zero.');
  const qDesignM3s = designFlowLs / 1000;
  const full = calculatePipeHydraulics(diameterMm, slope, material, roughnessOverride);
  const maxFreeSurfaceCapacityLs = full.capacity * MAX_FREE_SURFACE_FLOW_RATIO * 1000;

  if (qDesignM3s <= 0) {
    return {
      depthRatio: 0,
      flowDepthMm: 0,
      actualVelocity: 0,
      maxFreeSurfaceCapacityLs,
      flowCondition: 'Free surface',
      froudeNumber: 0,
      regime: 'Subcritical',
    };
  }

  // Exceeding the just-full Manning rate does not itself mean the flow is
  // pressurized: a circular conduit carries its maximum open-channel rate near
  // y/D=0.938. Do not invent normal depth or a Froude regime beyond that maximum.
  if (designFlowLs > maxFreeSurfaceCapacityLs * (1 + 1e-12)) {
    const fullArea = (Math.PI * d * d) / 4;
    return {
      depthRatio: 1.0,
      flowDepthMm: diameterMm,
      actualVelocity: qDesignM3s / fullArea,
      maxFreeSurfaceCapacityLs,
      flowCondition: 'Pressure flow analysis required',
      froudeNumber: null,
      regime: 'Not assessed',
    };
  }

  // The circular-channel Manning curve has two normal-depth roots between
  // full-pipe capacity and its open-channel peak. Keep the lower-depth root
  // through the just-full rate, then use the descending near-crown branch for
  // higher flows up to the free-surface maximum.
  const dischargeAt = (thetaRad: number) => {
    const area = (d * d / 8) * (thetaRad - Math.sin(thetaRad));
    const perimeter = (d * thetaRad) / 2;
    const hydraulicRadius = perimeter > 0 ? area / perimeter : 0;
    return hydraulicRadius > 0
      ? (1 / n) * area * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slope)
      : 0;
  };
  const useNearCrownBranch = qDesignM3s > full.capacity * (1 + 1e-12);
  let low = useNearCrownBranch ? MAX_FREE_SURFACE_THETA_RAD : 0;
  let high = useNearCrownBranch ? 2 * Math.PI : MAX_FREE_SURFACE_THETA_RAD;
  let theta = (low + high) / 2;

  for (let iter = 0; iter < 60; iter++) {
    theta = (low + high) / 2;
    const qCalc = dischargeAt(theta);
    if (useNearCrownBranch ? qCalc > qDesignM3s : qCalc < qDesignM3s) {
      low = theta;
    } else {
      high = theta;
    }
  }

  // Calculate geometric depth and velocity from theta
  const depth = (d / 2) * (1 - Math.cos(theta / 2));
  const depthRatio = Math.min(1.0, Math.max(0.0, depth / d));
  const area = (d * d / 8) * (theta - Math.sin(theta));
  const actualVelocity = area > 0 ? qDesignM3s / area : 0;

  // Top water surface width T = D * sin(theta/2)
  const topWidth = d * Math.sin(theta / 2);
  const hydraulicDepth = area / topWidth;
  const froudeNumber = hydraulicDepth > 0 ? actualVelocity / Math.sqrt(9.80665 * hydraulicDepth) : 0;

  let regime: PartialFlowResult['regime'] = 'Subcritical';
  if (froudeNumber > 1.1) regime = 'Supercritical';
  else if (froudeNumber >= 0.9) regime = 'Critical';

  return {
    depthRatio: Math.round(depthRatio * 1000) / 1000,
    flowDepthMm: Math.round(depth * 1000),
    actualVelocity: Math.round(actualVelocity * 100) / 100,
    maxFreeSurfaceCapacityLs,
    flowCondition: 'Free surface',
    froudeNumber: Math.round(froudeNumber * 100) / 100,
    regime,
  };
}

export interface PressurizedPipeReachResult {
  pipeId: string;
  horizontalLengthM: number;
  flowLs: number;
  velocityMps: number;
  frictionSlope: number;
  frictionLossM: number;
  upstreamHglM: number;
  downstreamHglM: number;
  upstreamCrownM: number;
  downstreamCrownM: number;
  upstreamGroundM?: number;
  downstreamGroundM?: number;
}

/**
 * Computes a full-bore, single-flow energy profile working upstream from an
 * engineer-supplied pipe-outlet HGL. It intentionally does not solve mixed
 * free-surface/pressure transitions, tailwater, access-hole K values, or
 * branched networks. Each supplied junction K uses the downstream pipe's
 * mean velocity head as its reference.
 */
export function calculatePressurizedPipeProfile(
  manholes: Manhole[],
  pipes: Pipe[],
  outfallHglM: number,
): PressurizedPipeReachResult[] {
  const routeIssues = validateLinearPipeRoute(manholes, pipes);
  if (routeIssues.length > 0) throw new Error(routeIssues.join(' '));
  if (!Number.isFinite(outfallHglM)) throw new RangeError('Enter a finite HGL boundary at the downstream pipe outlet.');

  const flowLs = pipes[0]?.designFlowLs;
  if (!Number.isFinite(flowLs) || (flowLs as number) <= 0) {
    throw new RangeError('Pressure HGL requires a positive design flow in every pipe.');
  }
  const flowTolerance = Math.max(1e-9, Math.abs(flowLs as number) * 1e-9);
  if (pipes.some(pipe => Math.abs(pipe.designFlowLs - (flowLs as number)) > flowTolerance)) {
    throw new Error('Pressure HGL requires the same design flow in every reach; this model does not represent lateral inflows and will not infer them.');
  }
  for (const pipe of pipes) {
    const from = manholes.find(manhole => manhole.id === pipe.fromId);
    const to = manholes.find(manhole => manhole.id === pipe.toId);
    if (!from || !to) throw new Error(`${pipe.id}: connected manholes are missing.`);
    const lengthM = calculatePipeAlignmentLengthM(pipe, from, to);
    const slope = ((from.invertOut as number) - (to.invertIn as number)) / lengthM;
    if (!Number.isFinite(slope) || slope <= 0) throw new Error(`${pipe.id}: pressure HGL requires a positive surveyed/design invert fall in the flow direction.`);
    const freeSurface = solvePartialFlow(pipe.diameterMm, slope, pipe.material, pipe.designFlowLs, pipe.manningN);
    if (freeSurface.flowCondition !== 'Pressure flow analysis required') {
      throw new Error(`${pipe.id}: this method only handles full-bore pressure flow when the design discharge exceeds the maximum free-surface capacity.`);
    }
  }
  for (let index = 1; index < manholes.length - 1; index += 1) {
    const manhole = manholes[index];
    if (!Number.isFinite(manhole.junctionLossK) || (manhole.junctionLossK as number) < 0) {
      throw new Error(`${manhole.id}: enter the engineer-specified junction loss K; METARDU will not assume a zero loss.`);
    }
  }

  const gravity = 9.80665;
  const reaches = new Array<PressurizedPipeReachResult>(pipes.length);
  const lastPipe = pipes[pipes.length - 1];
  const lastDiameterM = lastPipe.diameterMm / 1000;
  const lastArea = Math.PI * lastDiameterM ** 2 / 4;
  let downstreamEglM = outfallHglM + (((flowLs as number) / 1000) / lastArea) ** 2 / (2 * gravity);

  for (let index = pipes.length - 1; index >= 0; index -= 1) {
    const pipe = pipes[index];
    const from = manholes[index];
    const to = manholes[index + 1];
    const diameterM = pipe.diameterMm / 1000;
    const areaM2 = Math.PI * diameterM ** 2 / 4;
    const hydraulicRadiusM = diameterM / 4;
    const velocityMps = ((flowLs as number) / 1000) / areaM2;
    const velocityHeadM = velocityMps ** 2 / (2 * gravity);
    const lengthM = calculatePipeAlignmentLengthM(pipe, from, to);
    const manningN = pipe.manningN ?? MANNING_N[pipe.material];
    const frictionSlope = ((((flowLs as number) / 1000) * manningN) / (areaM2 * hydraulicRadiusM ** (2 / 3))) ** 2;
    const frictionLossM = frictionSlope * lengthM;
    const upstreamEglM = downstreamEglM + frictionLossM;
    const upstreamHglM = upstreamEglM - velocityHeadM;
    const downstreamHglM = downstreamEglM - velocityHeadM;
    const upstreamCrownM = (from.invertOut as number) + diameterM;
    const downstreamCrownM = (to.invertIn as number) + diameterM;

    if (upstreamHglM < upstreamCrownM - 1e-6 || downstreamHglM < downstreamCrownM - 1e-6) {
      throw new Error(`${pipe.id}: calculated HGL falls below the pipe crown. The full-bore pressure assumption is not supported; use a mixed-flow method with an approved boundary condition.`);
    }

    reaches[index] = {
      pipeId: pipe.id,
      horizontalLengthM: lengthM,
      flowLs: flowLs as number,
      velocityMps,
      frictionSlope,
      frictionLossM,
      upstreamHglM,
      downstreamHglM,
      upstreamCrownM,
      downstreamCrownM,
      upstreamGroundM: from.groundLevel,
      downstreamGroundM: to.groundLevel,
    };

    if (index > 0) {
      const junctionK = manholes[index].junctionLossK as number;
      downstreamEglM = upstreamEglM + junctionK * velocityHeadM;
    }
  }

  return reaches;
}

/**
 * Calculates cover above the pipe crown from entered ground and invert levels.
 * Acceptance is only assessed when the project cover requirement is supplied.
 */
export function calculatePipeCover(
  pipe: Pipe,
  fromMh?: Manhole,
  toMh?: Manhole,
  requiredCoverM?: number,
): PipeCover {
  if (!fromMh || !toMh || !Number.isFinite(fromMh.groundLevel) || !Number.isFinite(toMh.groundLevel) ||
      !Number.isFinite(fromMh.invertOut) || !Number.isFinite(toMh.invertIn)) {
    throw new Error('Cover cannot be assessed until both ground levels and the upstream/outgoing pipe inverts are supplied.');
  }
  if (!Number.isFinite(pipe.diameterMm) || pipe.diameterMm <= 0) throw new RangeError('Pipe diameter must be greater than zero.');
  if (requiredCoverM !== undefined && (!Number.isFinite(requiredCoverM) || requiredCoverM <= 0)) {
    throw new RangeError('A cover requirement must be finite and greater than zero.');
  }
  if (!Number.isFinite(pipe.outsideDiameterMm) || (pipe.outsideDiameterMm as number) <= 0) {
    return {
      status: 'Not Assessed',
      requiredCoverM,
      message: "Cover is not assessed until the manufacturer's outside diameter is supplied.",
    };
  }
  const dM = (pipe.outsideDiameterMm as number) / 1000;
  const glUp = fromMh.groundLevel as number;
  const invUp = fromMh.invertOut as number;
  const crownUp = invUp + dM;
  const coverUp = glUp - crownUp;

  const glDown = toMh.groundLevel as number;
  const invDown = toMh.invertIn as number;
  const crownDown = invDown + dM;
  const coverDown = glDown - crownDown;

  const minCover = Math.min(coverUp, coverDown);

  let status: PipeCover['status'] = requiredCoverM === undefined ? 'Not Assessed' : 'Meets Criterion';
  let message = requiredCoverM === undefined
    ? 'Cover depth is calculated; enter the project minimum cover to assess it.'
    : `Cover meets the entered project requirement of ${requiredCoverM.toFixed(2)} m.`;

  if (minCover < 0) {
    status = 'Daylight';
    message = 'CRITICAL: Pipe crown daylights above ground level!';
  } else if (requiredCoverM !== undefined && minCover < requiredCoverM) {
    status = 'Below Criterion';
    message = `Cover is below the entered project requirement of ${requiredCoverM.toFixed(2)} m.`;
  }

  return {
    coverUpstream: Math.round(coverUp * 100) / 100,
    coverDownstream: Math.round(coverDown * 100) / 100,
    minCover: Math.round(minCover * 100) / 100,
    status,
    requiredCoverM,
    message,
  };
}

/**
 * Evaluates drop continuity and detects adverse steps or backdrop drop manholes.
 */
export function analyzeManholeDrops(manholes: Manhole[]): ManholeDropAnalysis[] {
  return manholes.map((mh) => {
    if (mh.invertIn === undefined && mh.invertOut !== undefined) {
      return {
        manholeId: mh.id,
        dropM: 0,
        type: 'Inlet',
        note: 'Terminal head inlet manhole.',
      };
    }

    if (mh.invertIn !== undefined && mh.invertOut === undefined) {
      return {
        manholeId: mh.id,
        dropM: 0,
        type: 'Terminal',
        note: 'Terminal outfall / discharge structure.',
      };
    }

    if (mh.invertIn !== undefined && mh.invertOut !== undefined) {
      const drop = mh.invertIn - mh.invertOut;
      if (drop < 0) {
        return {
          manholeId: mh.id,
          dropM: Math.round(drop * 1000) / 1000,
          type: 'Adverse Step',
          note: 'Invert In is below Invert Out; review the connection and hydraulic consequences against the project design.',
        };
      }
      if (drop > 0) {
        return {
          manholeId: mh.id,
          dropM: Math.round(drop * 1000) / 1000,
          type: 'Positive Step',
          note: `Invert step is ${(drop * 1000).toFixed(0)}mm; confirm the manhole/drop arrangement against the approved detail and project criteria.`,
        };
      }
      return {
        manholeId: mh.id,
        dropM: Math.round(drop * 1000) / 1000,
        type: 'Continuous',
        note: `Measured invert step is ${(drop * 1000).toFixed(0)}mm.`,
      };
    }

    return {
      manholeId: mh.id,
      dropM: 0,
      type: 'Continuous',
      note: 'Inverts not fully defined.',
    };
  });
}

/**
 * Rational Method Runoff Calculation
 * Q (m3/s) = (C * I * A) / 360
 * where C is runoff coefficient, I is rainfall intensity (mm/hr), A is catchment area in hectares.
 */
export function calculateRationalRunoff(
  c: number,
  intensityMmHr: number,
  areaHa: number
): { flowM3s: number; flowLs: number } {
  if (!Number.isFinite(c) || c < 0 || c > 1) throw new RangeError('Runoff coefficient must be between 0 and 1.');
  if (!Number.isFinite(intensityMmHr) || intensityMmHr <= 0) throw new RangeError('Rainfall intensity must be greater than zero.');
  if (!Number.isFinite(areaHa) || areaHa <= 0) throw new RangeError('Catchment area must be greater than zero.');
  const qM3s = (c * intensityMmHr * areaHa) / 360;
  const qLs = qM3s * 1000;
  return {
    flowM3s: Math.round(qM3s * 10000) / 10000,
    flowLs: Math.round(qLs * 10) / 10,
  };
}

export const RUNOFF_PRESETS: Record<string, { label: string; c: number; desc: string }> = {
  roofs_asphalt: { label: 'Paved Roads, Roofs & Concrete', c: 0.90, desc: 'Impervious urban surfaces' },
  commercial_cbd: { label: 'Commercial CBD & High Density', c: 0.80, desc: 'Paved shopping plazas & tarmac' },
  suburban_residential: { label: 'Suburban Residential Lots', c: 0.50, desc: 'Detached homes with gardens' },
  light_industrial: { label: 'Light Industrial / Logistics', c: 0.65, desc: 'Roofs, truck loading bays, hardstand' },
  parks_playgrounds: { label: 'Lawns, Parks & Golf Courses', c: 0.20, desc: 'Vegetated permeable ground' },
  hilly_terrain: { label: 'Steep Rocky Slopes / Cultivated', c: 0.60, desc: 'High runoff velocity terrain' },
};

export interface AutoGradeOptions {
  targetSlopePercent: number; // e.g. 1.0%
  minCoverM: number; // e.g. 1.2m
  manholeDropM: number; // e.g. 0.03m
  startInvertM?: number;
}

/**
 * Proposes inverts along a connected gravity run and reports conflicts with the entered cover criterion.
 */
export function autoGradeNetwork(
  manholes: Manhole[],
  pipes: Pipe[],
  options: AutoGradeOptions
): { manholes: Manhole[]; adjustedCount: number; issues: string[] } {
  const { targetSlopePercent, minCoverM, manholeDropM } = options;
  const updatedMh: Manhole[] = manholes.map((m) => ({ ...m }));
  const issues = validateLinearPipeRoute(manholes, pipes, { requireInverts: false, requireDesignFlow: false, requireDiameter: false });
  if (!Number.isFinite(targetSlopePercent) || targetSlopePercent <= 0) issues.push('Target slope must be greater than zero.');
  if (!Number.isFinite(minCoverM) || minCoverM <= 0) issues.push('Project minimum cover must be greater than zero.');
  if (!Number.isFinite(manholeDropM) || manholeDropM < 0) issues.push('Manhole drop must be finite and non-negative.');
  pipes.forEach(pipe => {
    if (!Number.isFinite(pipe.outsideDiameterMm) || (pipe.outsideDiameterMm as number) <= 0) {
      issues.push(`${pipe.id}: enter the manufacturer's outside diameter before auto-grading cover.`);
    }
  });
  if (issues.length > 0) return { manholes: updatedMh, adjustedCount: 0, issues: [...new Set(issues)] };
  const slope = targetSlopePercent / 100;

  const firstPipe = pipes.find((p) => p.fromId === updatedMh[0].id);
  if (!firstPipe || !Number.isFinite(updatedMh[0].groundLevel)) {
    return { manholes, adjustedCount: 0, issues: ['The first manhole needs a ground level and an outgoing pipe.'] };
  }
  const firstDiamM = (firstPipe.outsideDiameterMm as number) / 1000;

  let currentInvert: number;
  if (options.startInvertM !== undefined && Number.isFinite(options.startInvertM)) {
    currentInvert = options.startInvertM;
  } else {
    currentInvert = (updatedMh[0].groundLevel as number) - minCoverM - firstDiamM;
  }

  updatedMh[0].invertOut = Math.round(currentInvert * 1000) / 1000;

  for (let i = 0; i < updatedMh.length - 1; i++) {
    const fromMh = updatedMh[i];
    const toMh = updatedMh[i + 1];

    const pipe = pipes.find((p) => p.fromId === fromMh.id && p.toId === toMh.id);
    if (!pipe || !Number.isFinite(toMh.groundLevel)) {
      return { manholes, adjustedCount: 0, issues: [`No valid pipe or ground level connects ${fromMh.id} to ${toMh.id}.`] };
    }
    const dist = calculatePipeAlignmentLengthM(pipe, fromMh, toMh);
    if (!Number.isFinite(dist) || dist <= 1e-9) {
      return { manholes, adjustedCount: 0, issues: [`${pipe.id}: plan length must be greater than zero.`] };
    }
    const fall = dist * slope;

    const incomingInvert = (fromMh.invertOut ?? currentInvert) - fall;
    toMh.invertIn = Math.round(incomingInvert * 1000) / 1000;

    const outInvert = toMh.invertIn - manholeDropM;
    toMh.invertOut = Math.round(outInvert * 1000) / 1000;
    currentInvert = toMh.invertOut;
  }

  const coverIssues = pipes.flatMap(pipe => {
    const from = updatedMh.find(mh => mh.id === pipe.fromId);
    const to = updatedMh.find(mh => mh.id === pipe.toId);
    if (!from || !to) return [`${pipe.id}: connected manholes are missing.`];
    const cover = calculatePipeCover(pipe, from, to, minCoverM);
    return cover.status === 'Not Assessed'
      ? [`${pipe.id}: cover cannot be checked until manufacturer outside diameter is entered.`]
      : cover.status === 'Below Criterion' || cover.status === 'Daylight'
      ? [`${pipe.id}: proposed grade leaves only ${(cover.minCover as number).toFixed(2)} m minimum crown cover.`]
      : [];
  });
  return { manholes: updatedMh, adjustedCount: updatedMh.length, issues: coverIssues };
}

/**
 * Returns the smallest listed internal diameter meeting full-pipe Manning capacity at the supplied flow and slope.
 */
export function autoSizePipe(
  designFlowLs: number,
  slope: number,
  material: keyof typeof MANNING_N,
  roughnessOverride?: number,
): number | null {
  if (!Number.isFinite(designFlowLs) || designFlowLs <= 0) throw new RangeError('Design flow must be greater than zero.');
  if (!Number.isFinite(slope) || slope <= 0) throw new RangeError('Pipe slope must be finite and positive in the flow direction.');
  const designFlow = designFlowLs / 1000;

  // Capacity is the only selection rule here; velocity, depth, surcharge and project checks remain visible for review.
  for (const diam of STANDARD_DIAMETERS) {
    const { capacity } = calculatePipeHydraulics(diam, slope, material, roughnessOverride);
    if (capacity >= designFlow) {
      return diam;
    }
  }

  return null;
}

/**
 * Generates an AutoCAD DXF file containing both 2D Plan View and Longitudinal Profile View.
 */
export function generateNetworkDXF(
  manholes: Manhole[],
  pipes: Pipe[],
  projectCrs = '',
): string {
  const issues = validateLinearPipeRoute(manholes, pipes);
  pipes.forEach(pipe => {
    if (!Number.isFinite(pipe.outsideDiameterMm) || (pipe.outsideDiameterMm as number) <= 0) {
      issues.push(`${pipe.id}: enter the manufacturer's outside diameter before creating a profile DXF.`);
    }
  });
  if (issues.length > 0) throw new Error(`Cannot create a drainage DXF: ${issues.join(' ')}`);
  const safeText = (value: string) => value.replace(/[\r\n\u0000-\u001f]/g, ' ').trim();
  let dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n`;
  dxf += `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n8\n`;

  const layers = [
    { name: 'DRAIN_PLAN_MH', color: 4 },
    { name: 'DRAIN_PLAN_PIPE', color: 1 },
    { name: 'DRAIN_PLAN_TEXT', color: 7 },
    { name: 'DRAIN_PROF_GROUND', color: 3 },
    { name: 'DRAIN_PROF_PIPE', color: 5 },
    { name: 'DRAIN_PROF_SHAFTS', color: 8 },
    { name: 'DRAIN_PROF_GRID', color: 9 },
    { name: 'DRAIN_PROF_TEXT', color: 7 },
  ];

  for (const l of layers) {
    dxf += `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.color}\n6\nCONTINUOUS\n0\n`;
  }
  dxf += `0\nENDTAB\n0\nENDSEC\n`;
  dxf += `0\nSECTION\n2\nENTITIES\n`;

  // --- 1. PLAN VIEW ENTITIES ---
  for (const mh of manholes) {
    const easting = mh.easting as number;
    const northing = mh.northing as number;
    const groundLevel = mh.groundLevel as number;
    dxf += `0\nCIRCLE\n8\nDRAIN_PLAN_MH\n10\n${easting}\n20\n${northing}\n30\n0\n40\n0.6\n`;
    dxf += `0\nTEXT\n8\nDRAIN_PLAN_TEXT\n10\n${easting + 1}\n20\n${northing + 1}\n30\n0\n40\n0.5\n1\n${safeText(mh.id)} (GL:${groundLevel.toFixed(2)})\n`;
  }

  for (const p of pipes) {
    const mh1 = manholes.find((m) => m.id === p.fromId);
    const mh2 = manholes.find((m) => m.id === p.toId);
    if (mh1 && mh2) {
      const alignment = buildPipeAlignment(p, mh1, mh2);
      for (let index = 1; index < alignment.vertices.length; index += 1) {
        const start = alignment.vertices[index - 1];
        const end = alignment.vertices[index];
        dxf += `0\nLINE\n8\nDRAIN_PLAN_PIPE\n10\n${start.easting}\n20\n${start.northing}\n30\n0\n11\n${end.easting}\n21\n${end.northing}\n31\n0\n`;
      }
      const midpoint = alignmentPointAt(alignment, alignment.lengthM / 2);
      const midX = midpoint.easting;
      const midY = midpoint.northing;
      dxf += `0\nTEXT\n8\nDRAIN_PLAN_TEXT\n10\n${midX}\n20\n${midY + 0.8}\n30\n0\n40\n0.4\n1\n${safeText(p.id)} ID${p.diameterMm} OD${p.outsideDiameterMm}mm (${safeText(p.material)})\n`;
    }
  }

  // --- 2. LONGITUDINAL PROFILE SECTION ENTITIES ---
  const profBaseY = (manholes[0].northing as number) - 200;
  const profBaseX = manholes[0].easting as number;

  let currentChainage = 0;
  const mhChainages: Record<string, number> = {};
  if (manholes[0]) {
    mhChainages[manholes[0].id] = 0;
  }

  for (let i = 0; i < manholes.length - 1; i++) {
    const m1 = manholes[i];
    const m2 = manholes[i + 1];
    const alignment = buildPipeAlignment(pipes[i], m1, m2);
    currentChainage += alignment.lengthM;
    mhChainages[m2.id] = currentChainage;
  }

  const minElev = Math.min(
    ...manholes.map((m) => Math.min(m.groundLevel as number, m.invertIn ?? m.invertOut ?? (m.groundLevel as number)))
  );
  const datumElev = Math.floor(minElev - 2);
  const vertExag = 5;

  const totalLength = currentChainage;
  dxf += `0\nLINE\n8\nDRAIN_PROF_GRID\n10\n${profBaseX}\n20\n${profBaseY}\n30\n0\n11\n${profBaseX + totalLength}\n21\n${profBaseY}\n31\n0\n`;
  dxf += `0\nTEXT\n8\nDRAIN_PROF_TEXT\n10\n${profBaseX - 15}\n20\n${profBaseY}\n30\n0\n40\n0.6\n1\nDATUM ${datumElev}.00m\n`;
  dxf += `0\nTEXT\n8\nDRAIN_PROF_TEXT\n10\n${profBaseX - 15}\n20\n${profBaseY - 18}\n30\n0\n40\n0.5\n1\n${safeText(`PRELIMINARY ${projectCrs || 'CRS NOT SUPPLIED'} - VERIFY DATUM AND PROJECT CRITERIA. GROUND JOINS MANHOLE LEVELS; INTERMEDIATE SURFACE NOT SURVEYED.`)}\n`;

  for (let i = 0; i < manholes.length - 1; i++) {
    const m1 = manholes[i];
    const m2 = manholes[i + 1];
    const ch1 = mhChainages[m1.id] ?? 0;
    const ch2 = mhChainages[m2.id] ?? 0;
    const y1 = profBaseY + ((m1.groundLevel as number) - datumElev) * vertExag;
    const y2 = profBaseY + ((m2.groundLevel as number) - datumElev) * vertExag;

    dxf += `0\nLINE\n8\nDRAIN_PROF_GROUND\n10\n${profBaseX + ch1}\n20\n${y1}\n30\n0\n11\n${profBaseX + ch2}\n21\n${y2}\n31\n0\n`;
  }

  for (const mh of manholes) {
    const ch = mhChainages[mh.id] ?? 0;
    const glY = profBaseY + ((mh.groundLevel as number) - datumElev) * vertExag;
    const invVal = Math.min(mh.invertIn ?? Number.POSITIVE_INFINITY, mh.invertOut ?? Number.POSITIVE_INFINITY);
    const invY = profBaseY + (invVal - datumElev) * vertExag;

    dxf += `0\nLINE\n8\nDRAIN_PROF_SHAFTS\n10\n${profBaseX + ch - 0.5}\n20\n${glY}\n30\n0\n11\n${profBaseX + ch - 0.5}\n21\n${invY}\n31\n0\n`;
    dxf += `0\nLINE\n8\nDRAIN_PROF_SHAFTS\n10\n${profBaseX + ch + 0.5}\n20\n${glY}\n30\n0\n11\n${profBaseX + ch + 0.5}\n21\n${invY}\n31\n0\n`;

    dxf += `0\nTEXT\n8\nDRAIN_PROF_TEXT\n10\n${profBaseX + ch}\n20\n${profBaseY - 5}\n30\n0\n40\n0.5\n1\nCH: ${(ch).toFixed(1)}m\n`;
    dxf += `0\nTEXT\n8\nDRAIN_PROF_TEXT\n10\n${profBaseX + ch}\n20\n${profBaseY - 9}\n30\n0\n40\n0.5\n1\nGL: ${(mh.groundLevel as number).toFixed(2)}\n`;
    if (mh.invertOut !== undefined) {
      dxf += `0\nTEXT\n8\nDRAIN_PROF_TEXT\n10\n${profBaseX + ch}\n20\n${profBaseY - 13}\n30\n0\n40\n0.5\n1\nINV: ${mh.invertOut.toFixed(2)}\n`;
    }
  }

  for (const p of pipes) {
    const m1 = manholes.find((m) => m.id === p.fromId);
    const m2 = manholes.find((m) => m.id === p.toId);
    if (m1 && m2) {
      const ch1 = mhChainages[m1.id] ?? 0;
      const ch2 = mhChainages[m2.id] ?? 0;
      const dM = (p.outsideDiameterMm as number) / 1000;
      const inv1 = m1.invertOut as number;
      const inv2 = m2.invertIn as number;

      const yInv1 = profBaseY + (inv1 - datumElev) * vertExag;
      const yInv2 = profBaseY + (inv2 - datumElev) * vertExag;
      const yCrown1 = profBaseY + (inv1 + dM - datumElev) * vertExag;
      const yCrown2 = profBaseY + (inv2 + dM - datumElev) * vertExag;

      dxf += `0\nLINE\n8\nDRAIN_PROF_PIPE\n10\n${profBaseX + ch1}\n20\n${yInv1}\n30\n0\n11\n${profBaseX + ch2}\n21\n${yInv2}\n31\n0\n`;
      dxf += `0\nLINE\n8\nDRAIN_PROF_PIPE\n10\n${profBaseX + ch1}\n20\n${yCrown1}\n30\n0\n11\n${profBaseX + ch2}\n21\n${yCrown2}\n31\n0\n`;
    }
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
}

