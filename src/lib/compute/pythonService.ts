// src/lib/compute/pythonService.ts
//
// Two roles live in this file:
//
// 1. Edge Spatial Engine — local (browser/WASM) implementations of the
//    lightweight spatial ops (datum transform, contours, volumes) that
//    surveyors need offline (audit fix 2026-07-31: cloud-python versions
//    were ripped out for these).
//
// 2. callPythonCompute — the HTTP bridge to the FastAPI compute worker
//    (docker-compose service `metardu-worker`, PYTHON_COMPUTE_URL +
//    WORKER_SECRET). REVIVED 2026-08-31 after the audit-C9 "make it work"
//    pass: the worker now runs a real GNSS SPP engine (RINEX parsing,
//    IS-GPS-200 satellite positions, SP3 precise ephemeris, WLS solver —
//    see python_worker/gnss_processor.py), and this bridge actually
//    reaches it again.
//
//    Honesty rules for the bridge (audit C9 residue):
//      - When the worker is not configured or unreachable, callers get an
//        explicit error. Nothing is ever simulated or fabricated here.
//      - Worker-side task failures propagate verbatim.
//
// Call conventions supported (both used by existing routes):
//      callPythonCompute('task_name', params)        → POST {url}/compute {task, params}
//      callPythonCompute('/path', envelope)          → POST {url}{path} with the body as-is

import { transformCoordinates } from '@/lib/geo/transform'
import { generateContours as localGenerateContours, type SpotHeight } from '@/lib/engine/contours'
import computeContract from '../../../python_worker/compute-contract.json'

/** Legacy coordinate-field adapter; both CRS must be explicit and heights stay unchanged. */
export async function convertDatum(
  coords: Array<{id?: string, easting: number, northing: number, elevation?: number | null}>,
  fromDatum: string = '',
  toDatum: string = ''
) {
  const reservedIds = new Set(coords.flatMap(point => point.id === undefined ? [] : [point.id]))
  const points = coords.map((point, index) => {
    let id = point.id
    if (id === undefined) {
      id = `pt-${index}`
      while (reservedIds.has(id)) id = `_${id}`
      reservedIds.add(id)
    }
    return { id, x: point.easting, y: point.northing, z: point.elevation }
  })
  const result = transformCoordinates({
    points,
    fromCRS: fromDatum, toCRS: toDatum,
  })
  return result.points.map((point, index) => ({ ...coords[index], easting: point.x, northing: point.y,
    ...(point.z !== undefined ? { elevation: point.z } : {}), datum: result.toDatum,
    horizontalCrs: result.toCRS, horizontalUnits: result.toUnits, heightTransformed: false as const }))
}

/** Legacy adapter retained for callers; it supplies no verified criteria or worker proof. */
export async function validateGeometry(_params: {
  terrain: string
  designSpeed: number
  gradient: number
  radius: number
  ssd?: number
}) {
  return {
    status: 'UNASSESSED' as const,
    flags: ['Geometry approval requires explicit adopted project criteria and measured design evidence. Use the road-design comparisons; this legacy adapter performs no validation.'],
    fallback: true,
    source: 'not-assessed' as const,
  }
}

export async function generateContours(
  points: Array<{easting: number, northing: number, rl: number}>,
  interval: number = 1.0
) {
  try {
    const spotHeights: SpotHeight[] = points.map((p, i) => ({
      name: `P${i}`,
      easting: p.easting,
      northing: p.northing,
      elevation: p.rl
    }))
    
    // Generate contours entirely in browser using Delaunator (O(n log n))
    // Takes <200ms for 10,000 points.
    const contours = localGenerateContours(spotHeights, interval)
    
    return { contours }
  } catch {
    return { contours: [], fallback: true }
  }
}

export async function computeVolumes(
  sections: Array<{chainage: number, cut_area: number, fill_area: number}>,
  shrinkageFactor: number = 0.85
) {
  try {
    // Average End Area Method - computed instantly on edge
    let totalCut = 0
    let totalFill = 0
    const details = []

    // Sort by chainage just in case
    const sorted = [...sections].sort((a, b) => a.chainage - b.chainage)

    for (let i = 0; i < sorted.length - 1; i++) {
      const s1 = sorted[i]
      const s2 = sorted[i + 1]
      const L = s2.chainage - s1.chainage
      
      const cutVol = (L * (s1.cut_area + s2.cut_area)) / 2
      const fillVol = (L * (s1.fill_area + s2.fill_area)) / 2
      
      totalCut += cutVol
      totalFill += fillVol
      
      details.push({
        chainage_start: s1.chainage,
        chainage_end: s2.chainage,
        length: L,
        cut_volume: cutVol,
        fill_volume: fillVol
      })
    }
    
    const adjustedFill = totalFill * shrinkageFactor
    const netVolume = totalCut - adjustedFill
    
    return {
      sections: details,
      totals: {
        raw_cut: totalCut,
        raw_fill: totalFill,
        adjusted_fill: adjustedFill,
        net_volume: netVolume,
        shrinkage_factor: shrinkageFactor
      }
    }
  } catch {
    return { sections: [], totals: {}, fallback: true }
  }
}

// ─── Python compute worker bridge ──────────────────────────────────────────

export type PythonComputeResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string; fallback?: boolean; details?: unknown }

const DEFAULT_TIMEOUT_MS = 120_000

interface WorkerEnvelope {
  success: boolean
  data?: unknown
  error?: string
  detail?: string
  task?: string
  contract?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isAbortError(value: unknown): boolean {
  return isRecord(value) && value.name === 'AbortError'
}

/**
 * Call the Python compute worker (FastAPI, docker service `metardu-worker`).
 *
 * Two calling conventions:
 *  - `callPythonCompute('task_name', params)` → POST {PYTHON_COMPUTE_URL}/compute
 *    with `{ task, params }` (the worker's task registry dispatch)
 *  - `callPythonCompute('/path', envelope)` → POST {PYTHON_COMPUTE_URL}{path}
 *    with the body passed through unchanged (legacy envelope callers)
 *
 * Errors are ALWAYS explicit — this bridge never fabricates results and
 * never flags a failure as a "simulation" (audit C9).
 */
export async function callPythonCompute<T>(
  taskOrPath: string,
  body: unknown,
  opts?: { timeoutMs?: number }
): Promise<PythonComputeResult<T>> {
  const baseUrl = (process.env.PYTHON_COMPUTE_URL || '').replace(/\/+$/, '')
  const secret = process.env.WORKER_SECRET || ''

  if (!baseUrl) {
    return {
      ok: false,
      status: 503,
      error:
        'Python compute worker is not configured (PYTHON_COMPUTE_URL is not set). ' +
        'Server-side GNSS/RINEX processing is unavailable in this deployment.',
    }
  }

  if (!secret.trim()) {
    return { ok: false, status: 503, error: 'Compute worker credentials are not configured. Processing is unavailable.' }
  }

  const isPath = taskOrPath.startsWith('/')
  const url = isPath ? `${baseUrl}${taskOrPath}` : `${baseUrl}/compute`
  let payload: unknown = isPath ? body : { task: taskOrPath, params: body }
  const task = !isPath ? taskOrPath : taskOrPath === '/compute' && isRecord(body) && typeof body.task === 'string' ? body.task : null
  const contracts: Readonly<Record<string, string>> = computeContract.tasks
  const requiredContract = task !== null && Object.hasOwn(contracts, task) ? contracts[task] : null
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let checkingCapabilities = Boolean(requiredContract)
  try {
    if (requiredContract && task !== null) {
      // Never cache admission across worker replacements. A healthy process
      // does not establish that the required implementation is present.
      const admissionTimer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5000))
      try {
        const admission = await fetch(`${baseUrl}/capabilities`, {
          method: 'GET', headers: { 'X-Worker-Secret': secret }, cache: 'no-store', signal: controller.signal,
        })
        if (admission.status === 403) {
          return { ok: false, status: 502, error: 'Compute worker rejected the request (authentication failed — check WORKER_SECRET).' }
        }
        let capabilities: unknown
        try { capabilities = await admission.json() } catch (error) {
          if (isAbortError(error) || controller.signal.aborted) throw error
          capabilities = null
        }
        if (admission.status !== 200 || !isRecord(capabilities) || capabilities.protocol !== computeContract.protocol
          || !isRecord(capabilities.tasks) || capabilities.tasks[task] !== requiredContract) {
          return { ok: false, status: 503, error: 'This processing service is temporarily unavailable. Your input has not been submitted. Please contact support.' }
        }
      } finally {
        clearTimeout(admissionTimer)
      }
      payload = { ...(payload as Record<string, unknown>), contract: requiredContract }
    }
    checkingCapabilities = false

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // egress to the internal worker network only — never cached
      cache: 'no-store',
    })

    if (res.status === 403) {
      return {
        ok: false,
        status: 502,
        error: 'Compute worker rejected the request (authentication failed — check WORKER_SECRET).',
      }
    }
    if (res.status === 503) {
      return {
        ok: false,
        status: 502,
        error: 'Compute worker is running but not accepting requests (WORKER_SECRET not configured on the worker).',
      }
    }

    // NOTE: res.ok is not reliable across fetch implementations (jest's
    // jsdom polyfill omits it) — use the explicit status range.
    const statusOk = res.status >= 200 && res.status < 300

    let rawEnvelope: unknown
    try {
      rawEnvelope = await res.json()
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) throw error
      return {
        ok: false,
        status: 502,
        error: `Compute worker returned a non-JSON response (HTTP ${res.status}).`,
      }
    }
    const envelope = isRecord(rawEnvelope) ? rawEnvelope as unknown as WorkerEnvelope : null

    if (!statusOk) {
      return {
        ok: false,
        status: res.status,
        error: typeof envelope?.detail === 'string' ? envelope.detail
          : typeof envelope?.error === 'string' ? envelope.error : `Compute worker HTTP ${res.status}.`,
      }
    }
    if (envelope && envelope.success === false) {
      // The worker executed but the task itself failed — propagate verbatim.
      return {
        ok: false,
        status: 422,
        error: typeof envelope.error === 'string' && envelope.error ? envelope.error : 'Compute worker task failed.',
      }
    }
    if (envelope?.success !== true || envelope.data === undefined || envelope.data === null
      || (requiredContract && (envelope.task !== task || envelope.contract !== requiredContract))) {
      return { ok: false, status: 502, error: 'Processing returned an unusable result. No result was accepted. Please retry or contact support.' }
    }
    return { ok: true, value: envelope.data as T }
  } catch (err) {
    if (isAbortError(err) || controller.signal.aborted) {
      return {
        ok: false,
        status: 504,
        error: checkingCapabilities
          ? `Compute worker compatibility check timed out after ${Math.min(timeoutMs, 5000) / 1000} s.`
          : `Compute worker timed out after ${timeoutMs / 1000} s.`,
      }
    }
    return {
      ok: false,
      status: 502,
      error:
        'Could not reach the Python compute worker. It may be down or ' +
        'starting up — retry shortly. (' +
        (err instanceof Error ? err.message : 'network error') +
        ')',
    }
  } finally {
    clearTimeout(timer)
  }
}
