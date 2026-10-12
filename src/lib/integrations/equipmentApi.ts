import { Equipment, CalibrationLog, EquipmentWithStatus } from './equipment'
import { calcStatus } from './equipment'

// We need to match the DB names back to the frontend properties
function mapEquipmentRow(row: any): Equipment {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    brand: row.manufacturer || '',
    model: row.model || '',
    serialNumber: row.serial_number || '',
    purchaseDate: row.purchase_date ? String(row.purchase_date).split('T')[0] : '',
    lastCalibrationDate: row.last_calibrated ? String(row.last_calibrated).split('T')[0] : (row.last_calibration_date ? String(row.last_calibration_date).split('T')[0] : ''),
    intervalDays: row.interval_days || 365,
    location: row.location || '',
    notes: row.notes || '',
    createdAt: String(row.created_at),
  }
}

function mapCalibrationLogRow(row: any): CalibrationLog {
  return {
    id: row.id,
    equipmentId: row.equipment_id,
    date: row.calibration_date ? String(row.calibration_date).split('T')[0] : '',
    result: row.results || 'passed',
    technician: row.calibrated_by || '',
    certificate: row.certificate_number || '',
    notes: row.notes || '',
  }
}

export async function fetchAllEquipment(): Promise<EquipmentWithStatus[]> {
  const res = await fetch('/api/equipment?include_calibration=true')
  if (!res.ok) throw new Error('Failed to fetch equipment')
  const json = await res.json()
  const data = json.data?.equipment || []
  return data.map((r: any) => calcStatus(mapEquipmentRow(r))).sort((a: EquipmentWithStatus, b: EquipmentWithStatus) => a.daysUntilDue - b.daysUntilDue)
}

export async function createEquipmentApi(data: Omit<Equipment, 'id' | 'createdAt'>): Promise<Equipment> {
  const res = await fetch('/api/equipment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.name,
      type: data.type,
      manufacturer: data.brand,
      model: data.model,
      serialNumber: data.serialNumber,
      purchaseDate: data.purchaseDate || undefined,
      intervalDays: data.intervalDays,
      location: data.location,
      notes: data.notes,
    }),
  })
  if (!res.ok) throw new Error('Failed to create equipment')
  const json = await res.json()
  return mapEquipmentRow(json.data.equipment)
}

export async function updateEquipmentApi(id: string, updates: Partial<Omit<Equipment, 'id' | 'createdAt'>>): Promise<void> {
  const body: Record<string, any> = {}
  if (updates.name !== undefined) body.name = updates.name
  if (updates.type !== undefined) body.type = updates.type
  if (updates.brand !== undefined) body.manufacturer = updates.brand
  if (updates.model !== undefined) body.model = updates.model
  if (updates.serialNumber !== undefined) body.serial_number = updates.serialNumber
  if (updates.purchaseDate !== undefined) body.purchase_date = updates.purchaseDate
  if (updates.intervalDays !== undefined) body.interval_days = updates.intervalDays
  if (updates.location !== undefined) body.location = updates.location
  if (updates.notes !== undefined) body.notes = updates.notes

  const res = await fetch(`/api/equipment?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Failed to update equipment')
}

export async function deleteEquipmentApi(id: string): Promise<void> {
  const res = await fetch(`/api/equipment?id=${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete equipment')
}

export async function fetchCalibrationLogs(equipmentId: string): Promise<CalibrationLog[]> {
  const res = await fetch(`/api/equipment/${equipmentId}/calibration`)
  if (!res.ok) throw new Error('Failed to fetch calibration logs')
  const json = await res.json()
  const data = json.data?.calibrations || []
  return data.map(mapCalibrationLogRow).sort((a: CalibrationLog, b: CalibrationLog) => b.date.localeCompare(a.date))
}

export async function logCalibrationApi(data: Omit<CalibrationLog, 'id'>): Promise<CalibrationLog> {
  const nextCalDate = new Date(new Date(data.date).getTime() + (365 * 86400000)) // We can calculate next cal from interval if available
  const res = await fetch(`/api/equipment/${data.equipmentId}/calibration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      calibrationDate: data.date,
      nextCalibrationDate: nextCalDate.toISOString().split('T')[0], // we might want to let the backend/frontend handle this properly
      calibratedBy: data.technician,
      certificateNumber: data.certificate,
      results: data.result,
      notes: data.notes,
    }),
  })
  if (!res.ok) throw new Error('Failed to log calibration')
  const json = await res.json()
  return mapCalibrationLogRow(json.data.calibration)
}
