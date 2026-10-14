import { parseVerticalityCapture, sameVerticalityEvidence, type VerticalityCaptureSnapshot } from './verticalityCapture'
import { engineeringScheduleCsv } from '@/lib/engineering/engineeringScheduleCsv'

export interface DevicePlumbReading {
  schemaVersion: 1
  id: string
  ownerId: string
  projectId: string
  retainedAt: string
  snapshot: VerticalityCaptureSnapshot
  state: 'queued' | 'rejected' | 'synced'
  serverId: string | null
  message: string | null
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function plumbScope(ownerId: string, projectId: string): string {
  if (!ownerId.trim() || !projectId.trim()) throw new Error('Account and project are required for device storage.')
  return `metardu.plumb.v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(projectId)}:`
}
const deviceStore = () => window.localStorage
function parseReading(value: unknown, ownerId: string, projectId: string): DevicePlumbReading {
  const row = value as Partial<DevicePlumbReading> | null
  if (!row || row.schemaVersion !== 1 || row.ownerId !== ownerId || row.projectId !== projectId || typeof row.id !== 'string' || !UUID.test(row.id)
    || !['queued', 'rejected', 'synced'].includes(row.state ?? '') || typeof row.retainedAt !== 'string' || !Number.isFinite(Date.parse(row.retainedAt))
    || row.serverId !== null && typeof row.serverId !== 'string' || row.message !== null && typeof row.message !== 'string'
    || row.state === 'synced' && !row.serverId) throw new Error('Unreadable device reading. Preserve its device backup for review; it has not been overwritten.')
  const snapshot = parseVerticalityCapture(row.snapshot)
  if (!snapshot || snapshot.projectId !== projectId) throw new Error('Device capture evidence is inconsistent; retain the backup for review.')
  return { ...row, snapshot } as DevicePlumbReading
}
export function listDevicePlumbReadings(ownerId: string, projectId: string, store: Storage = deviceStore()): DevicePlumbReading[] {
  const prefix = plumbScope(ownerId, projectId) + 'reading:'
  const rows: DevicePlumbReading[] = []
  for (let index = 0; index < store.length; index++) {
    const key = store.key(index)
    if (!key?.startsWith(prefix)) continue
    const raw = store.getItem(key)
    if (raw === null) continue
    const row = parseReading(JSON.parse(raw) as unknown, ownerId, projectId)
    if (key !== prefix + row.id) throw new Error('Device reading identity differs from its key; retain the backup for review.')
    rows.push(row)
  }
  return rows.sort((a, b) => b.retainedAt.localeCompare(a.retainedAt) || a.id.localeCompare(b.id))
}
export function retainDevicePlumbReading(ownerId: string, snapshot: VerticalityCaptureSnapshot, id: string = crypto.randomUUID(), store: Storage = deviceStore()): DevicePlumbReading {
  const valid = parseVerticalityCapture(snapshot)
  if (!valid || !UUID.test(id)) throw new Error('A reading requires valid capture evidence and a stable UUID.')
  const key = plumbScope(ownerId, snapshot.projectId) + 'reading:' + id
  const previous = store.getItem(key)
  if (previous !== null) {
    const existing = parseReading(JSON.parse(previous) as unknown, ownerId, snapshot.projectId)
    if (!sameVerticalityEvidence(existing.snapshot, valid)) throw new Error('A reading ID cannot be reused for changed observations.')
    return existing
  }
  const row: DevicePlumbReading = { schemaVersion: 1, id, ownerId, projectId: snapshot.projectId, retainedAt: new Date().toISOString(), snapshot: valid, state: 'queued', serverId: null, message: null }
  // Each observation has its own key; another tab cannot replace a record list.
  store.setItem(key, JSON.stringify(row))
  return row
}
export function plumbDeliveryPayload(row: DevicePlumbReading) {
  const s = row.snapshot
  return { action: 'record_verticality', clientReadingId: row.id, capturedBy: row.ownerId,
    definitionId: s.definitionId, label: s.label, level: s.level, capturedAt: s.capturedAt, capturedCrs: s.capturedCrs, capturedVerticalDatum: s.capturedVerticalDatum,
    baseEasting: s.base.easting, baseNorthing: s.base.northing, baseRL: s.base.rl,
    topEasting: s.top.easting, topNorthing: s.top.northing, topRL: s.top.rl,
    horizontalUncertaintyM: s.horizontalUncertaintyM, heightUncertaintyM: s.heightUncertaintyM, criteria: s.criteria, instrument: s.instrument, notes: s.notes }
}
export async function deliverDevicePlumbReading(ownerId: string, projectId: string, id: string, fetcher: typeof fetch = fetch, store: Storage = deviceStore()): Promise<DevicePlumbReading> {
  const key = plumbScope(ownerId, projectId) + 'reading:' + id
  const raw = store.getItem(key)
  if (raw === null) throw new Error('Store the original reading on the device before delivery.')
  const row = parseReading(JSON.parse(raw) as unknown, ownerId, projectId)
  if (row.state !== 'queued') return row
  let update: Partial<DevicePlumbReading>
  try {
    const response = await fetcher(`/api/project/${encodeURIComponent(projectId)}/setout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plumbDeliveryPayload(row)) })
    const body = await response.json() as { error?: unknown; data?: { id?: unknown; captureSnapshot?: unknown } }
    if (!response.ok) {
      const rejected = response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status)
      update = { state: rejected ? 'rejected' : 'queued', message: typeof body.error === 'string' ? body.error : `Delivery failed (${response.status}); original reading retained.` }
    } else {
      const confirmed = parseVerticalityCapture(body.data?.captureSnapshot)
      if (typeof body.data?.id !== 'string' || !body.data.id.trim() || !confirmed || !sameVerticalityEvidence(confirmed, row.snapshot)) throw new Error('Server response did not confirm the original capture evidence.')
      update = { state: 'synced', serverId: body.data.id, message: null }
    }
  } catch (error) { update = { state: 'queued', message: error instanceof Error ? error.message : 'Connection unavailable; original reading retained.' } }
  const latest = parseReading(JSON.parse(store.getItem(key) ?? 'null') as unknown, ownerId, projectId)
  if (latest.state === 'synced') return latest
  const result = { ...latest, ...update }
  store.setItem(key, JSON.stringify(result))
  return result
}
export function exportDevicePlumbCsv(rows: DevicePlumbReading[]): string {
  const headers = ['Register_status', 'Account_ID', 'Project_ID', 'Device_ID', 'Server_ID', 'Device_retained_UTC', 'Column', 'Level', 'Base_E_m', 'Base_N_m', 'Base_RL_m', 'Top_E_m', 'Top_N_m', 'Top_RL_m', 'Height_m', 'Offset_m', 'Bearing_grid_deg', 'Tilt_ratio', 'Ratio_kind', 'Numerical_result', 'H_displacement_uncertainty_m', 'Height_uncertainty_m', 'Project_CRS', 'Captured_CRS', 'Project_height_reference', 'Captured_height_reference', 'Captured_UTC', 'Criteria_reference', 'Criteria_version', 'Max_offset_m', 'Min_tilt_ratio', 'Criteria_transcribed_approver', 'Evidence_issues', 'Instrument', 'Notes']
  return '\uFEFF' + engineeringScheduleCsv(headers, rows.map(row => {
    const s = row.snapshot, a = s.assessment
    return [row.state === 'synced' ? 'SERVER CONFIRMED - DRAFT' : 'DEVICE ONLY - NOT ON SERVER REGISTER', row.ownerId, row.projectId, row.id, row.serverId, row.retainedAt, s.label, s.level, s.base.easting, s.base.northing, s.base.rl, s.top.easting, s.top.northing, s.top.rl, a.heightM, a.offsetM, a.bearingDeg, a.tiltRatio, a.tiltRatioKind, a.result, s.horizontalUncertaintyM, s.heightUncertaintyM, s.horizontalCrs, s.capturedCrs, s.verticalDatum, s.capturedVerticalDatum, s.capturedAt, s.criteria?.reference, s.criteria?.version, s.criteria?.maxOffsetM, s.criteria?.minTiltRatio, s.criteria?.approvedBy, a.issues.join('; '), s.instrument, s.notes]
  }))
}
