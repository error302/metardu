import { z } from 'zod'
import type { Equipment, EquipmentDetails, CalibrationLog, EquipmentWithStatus } from './equipment'
import { calcStatus, compareCalibrationSchedules } from './equipment'
import { normalizeCalibrationResult } from '@/lib/equipment/calibration'

export const equipmentRowSchema = z.object({
  id: z.string().min(1), name: z.string(), type: z.string(), created_at: z.string().min(1),
  manufacturer: z.string().nullish(), model: z.string().nullish(), serial_number: z.string().nullish(),
  purchase_date: z.string().nullish(), interval_days: z.number().nullish(), location: z.string().nullish(), notes: z.string().nullish(),
  last_calibrated: z.string().nullish(), next_calibration: z.string().nullish(), calibration_result: z.string().nullish(),
  status: z.string().nullish(),
  calibration_status: z.string().optional(), days_until_expiry: z.number().nullable().optional(),
})
export const calibrationRowSchema = z.object({
  id: z.string().min(1), equipment_id: z.string().min(1), calibration_date: z.string(), next_calibration_date: z.string(),
  results: z.string().nullable(), calibrated_by: z.string().nullish(), calibration_lab: z.string().nullish(),
  certificate_number: z.string().nullish(), notes: z.string().nullish(),
})
async function readResponse<T extends z.ZodType>(res: Response, schema: T, fallback: string): Promise<z.output<T>> {
  const payload: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = z.object({ error: z.string() }).safeParse(payload)
    throw new Error(error.success ? error.data.error : fallback)
  }
  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new Error('The server response could not be verified. Refresh the records before retrying a save.')
  return parsed.data
}
function mapEquipmentRow(row: z.infer<typeof equipmentRowSchema>): Equipment {
  return { id: row.id, name: row.name, type: row.type, brand: row.manufacturer ?? '', model: row.model ?? '',
    serialNumber: row.serial_number ?? '', purchaseDate: row.purchase_date ?? '', lastCalibrationDate: row.last_calibrated ?? '',
    intervalDays: row.interval_days ?? NaN, location: row.location ?? '', notes: row.notes ?? '', createdAt: row.created_at,
    calibrationResult: normalizeCalibrationResult(row.calibration_result), recordedNextCalibrationDate: row.next_calibration ?? null, lifecycleStatus: row.status ?? 'unknown' }
}
function mapCalibrationLogRow(row: z.infer<typeof calibrationRowSchema>): CalibrationLog {
  return { id: row.id, equipmentId: row.equipment_id, date: row.calibration_date, nextDate: row.next_calibration_date,
    result: normalizeCalibrationResult(row.results), technician: row.calibrated_by || row.calibration_lab || '', certificate: row.certificate_number ?? '', notes: row.notes ?? '' }
}
export async function fetchAllEquipment(includeArchived = false): Promise<EquipmentWithStatus[]> {
  const payload = await readResponse(await fetch('/api/equipment?include_calibration=true' + (includeArchived ? '&status=all' : ''), { cache: 'no-store' }), z.object({ equipment: z.array(equipmentRowSchema) }), 'Could not load instrument records')
  return payload.equipment.map(row => calcStatus(mapEquipmentRow(row))).sort(compareCalibrationSchedules)
}
export async function createEquipmentApi(data: EquipmentDetails): Promise<Equipment> {
  const res = await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    name: data.name, type: data.type, manufacturer: data.brand, model: data.model, serialNumber: data.serialNumber,
    purchaseDate: data.purchaseDate || undefined, intervalDays: data.intervalDays, location: data.location, notes: data.notes,
  }) })
  const payload = await readResponse(res, z.object({ equipment: equipmentRowSchema }), 'Could not register the instrument')
  return mapEquipmentRow(payload.equipment)
}
export async function updateEquipmentApi(id: string, updates: Partial<EquipmentDetails> & { status?: 'active' | 'inactive' | 'maintenance' }): Promise<void> {
  const body: Record<string, unknown> = {}
  if (updates.name !== undefined) body.name = updates.name
  if (updates.type !== undefined) body.type = updates.type
  if (updates.brand !== undefined) body.manufacturer = updates.brand
  if (updates.model !== undefined) body.model = updates.model
  if (updates.serialNumber !== undefined) body.serialNumber = updates.serialNumber
  if (updates.purchaseDate !== undefined) body.purchaseDate = updates.purchaseDate
  if (updates.intervalDays !== undefined) body.intervalDays = updates.intervalDays
  if (updates.location !== undefined) body.location = updates.location
  if (updates.notes !== undefined) body.notes = updates.notes
  if (updates.status !== undefined) body.status = updates.status
  const payload = await readResponse(await fetch('/api/equipment?id=' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), z.object({ equipment: equipmentRowSchema }), 'Could not update the instrument')
  if (payload.equipment.id !== id) throw new Error('The update acknowledgement belongs to another instrument')
}
export async function deleteEquipmentApi(id: string): Promise<void> {
  const payload = await readResponse(await fetch('/api/equipment?id=' + encodeURIComponent(id), { method: 'DELETE' }), z.object({ id: z.string(), deleted: z.literal(true) }), 'Could not delete the instrument')
  if (payload.id !== id) throw new Error('The deletion acknowledgement belongs to another instrument')
}
export async function fetchCalibrationLogs(equipmentId: string): Promise<CalibrationLog[]> {
  const payload = await readResponse(await fetch('/api/equipment/' + encodeURIComponent(equipmentId) + '/calibration', { cache: 'no-store' }), z.object({ calibrations: z.array(calibrationRowSchema) }), 'Could not load calibration history')
  if (payload.calibrations.some(row => row.equipment_id !== equipmentId)) throw new Error('Calibration history belongs to another instrument')
  return payload.calibrations.map(mapCalibrationLogRow)
}
export type CalibrationEntry = Omit<CalibrationLog, 'id' | 'result'> & { result: 'passed' | 'failed' | 'adjusted' }
export async function logCalibrationApi(data: CalibrationEntry): Promise<CalibrationLog> {
  const payload = await readResponse(await fetch('/api/equipment/' + encodeURIComponent(data.equipmentId) + '/calibration', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calibrationDate: data.date,
      nextCalibrationDate: data.nextDate || undefined, calibratedBy: data.technician, certificateNumber: data.certificate, results: data.result, notes: data.notes }),
  }), z.object({ calibration: calibrationRowSchema }), 'Could not retain the calibration record')
  if (payload.calibration.equipment_id !== data.equipmentId) throw new Error('The saved calibration belongs to another instrument')
  return mapCalibrationLogRow(payload.calibration)
}
