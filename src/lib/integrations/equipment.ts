/**
 * Equipment Calibration Tracker
 * User-owned data — persisted in localStorage, keyed by user session.
 * No mock data. Users register their own instruments.
 */

export type EquipmentType = 'total_station' | 'gnss' | 'level' | 'theodolite' | 'edm' | 'prism_pole' | 'accessory'

export interface Equipment {
  id: string
  name: string
  type: EquipmentType
  brand: string
  model: string
  serialNumber: string
  purchaseDate: string         // ISO date string YYYY-MM-DD
  lastCalibrationDate: string  // ISO date string — user sets this on registration or after calibration
  intervalDays: number         // calibration interval in days (e.g. 365 = annual, 180 = 6-monthly)
  location: string
  notes: string
  createdAt: string
}

export interface CalibrationLog {
  id: string
  equipmentId: string
  date: string          // ISO date string
  result: 'passed' | 'failed' | 'adjusted'
  technician: string
  certificate: string
  notes: string
}

export type CalibrationStatus = 'ok' | 'due_soon' | 'overdue'

export interface EquipmentWithStatus extends Equipment {
  nextCalibrationDate: string
  daysUntilDue: number       // negative = overdue
  status: CalibrationStatus
  percentUsed: number        // 0–100, how far through the interval
}


// ── Storage helpers ──────────────────────────────────────────────────────────





// ── Status calculation ───────────────────────────────────────────────────────

export function calcStatus(eq: Equipment): EquipmentWithStatus {
  const lastCal = new Date(eq.lastCalibrationDate)
  const nextCal = new Date(lastCal.getTime() + eq.intervalDays * 86_400_000)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysUntilDue = Math.ceil((nextCal.getTime() - today.getTime()) / 86_400_000)

  let status: CalibrationStatus = 'ok'
  if (daysUntilDue < 0) status = 'overdue'
  else if (daysUntilDue <= 30) status = 'due_soon'

  const elapsed = today.getTime() - lastCal.getTime()
  const total = nextCal.getTime() - lastCal.getTime()
  const percentUsed = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))

  return {
    ...eq,
    nextCalibrationDate: nextCal.toISOString().split('T')[0],
    daysUntilDue,
    status,
    percentUsed,
  }
}

// ── API Helpers ─────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) return [] as unknown as T
  const json = await res.json()
  return json.equipment || json.data || json || []
}

async function apiPost<T>(path: string, body: unknown): Promise<T | null> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  if (!res.ok) return null
  const json = await res.json()
  return json.equipment || json.data || json || null
}

async function apiPatch<T>(path: string, body: unknown): Promise<T | null> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  if (!res.ok) return null
  const json = await res.json()
  return json.equipment || json.data || json || null
}

async function apiDelete(path: string): Promise<boolean> {
  const res = await fetch(path, { method: 'DELETE', credentials: 'include' })
  return res.ok
}

// ── CRUD (API-backed) ─────────────────────────────────────────────────────────

export async function getAll(): Promise<EquipmentWithStatus[]> {
  const items = await apiGet<any[]>('/api/equipment?include_calibration=true')
  return (items || []).map((item: any) => {
    const eq: Equipment = {
      id: item.id,
      name: item.name,
      type: item.type as EquipmentType,
      brand: item.manufacturer || '',
      model: item.model || '',
      serialNumber: item.serial_number || '',
      purchaseDate: item.purchase_date || '',
      lastCalibrationDate: item.last_calibrated || '',
      intervalDays: item.interval_days || 365,
      location: item.location || '',
      notes: item.notes || '',
      createdAt: item.created_at || '',
    }
    return calcStatus(eq)
  }).sort((a: any, b: any) => a.daysUntilDue - b.daysUntilDue)
}

export async function addEquipment(data: Omit<Equipment, 'id' | 'createdAt'>): Promise<Equipment | null> {
  return apiPost<Equipment>('/api/equipment', {
    name: data.name,
    type: data.type,
    manufacturer: data.brand,
    model: data.model,
    serial_number: data.serialNumber,
    purchase_date: data.purchaseDate,
    last_calibration_date: data.lastCalibrationDate,
    interval_days: data.intervalDays,
    location: data.location,
    notes: data.notes,
  })
}

export async function deleteEquipment(id: string): Promise<boolean> {
  return apiDelete(`/api/equipment/${id}`)
}

export async function updateEquipment(id: string, updates: Partial<Omit<Equipment, 'id' | 'createdAt'>>): Promise<boolean> {
  const result = await apiPatch(`/api/equipment/${id}`, {
    name: updates.name,
    type: updates.type,
    manufacturer: updates.brand,
    model: updates.model,
    serial_number: updates.serialNumber,
    purchase_date: updates.purchaseDate,
    last_calibration_date: updates.lastCalibrationDate,
    interval_days: updates.intervalDays,
    location: updates.location,
    notes: updates.notes,
  })
  return result !== null
}

// deleteEquipment is defined below as async

export async function logCalibration(data: Omit<CalibrationLog, 'id'>): Promise<CalibrationLog | null> {
  const result = await apiPost<CalibrationLog>(`/api/equipment/${data.equipmentId}/calibrations`, {
    calibration_date: data.date,
    result: data.result,
    technician: data.technician,
    certificate: data.certificate,
    notes: data.notes,
  })
  // Also update the equipment's last calibration date
  if (result) {
    await updateEquipment(data.equipmentId, { lastCalibrationDate: data.date })
  }
  return result
}

export async function getLogsFor(equipmentId: string): Promise<CalibrationLog[]> {
  const logs = await apiGet<CalibrationLog[]>(`/api/equipment/${equipmentId}/calibrations`)
  return (logs || []).sort((a: any, b: any) => b.date.localeCompare(a.date))
}

export function getEquipmentTypes(): { id: EquipmentType; label: string }[] {
  return [
    { id: 'total_station', label: 'Total Station' },
    { id: 'gnss',          label: 'GNSS Receiver' },
    { id: 'level',         label: 'Digital Level' },
    { id: 'theodolite',    label: 'Theodolite' },
    { id: 'edm',           label: 'EDM' },
    { id: 'prism_pole',    label: 'Prism Pole / Staff' },
    { id: 'accessory',     label: 'Accessory' },
  ]
}

export const BRANDS = ['Leica', 'Trimble', 'Topcon', 'Sokkia', 'Nikon', 'Pentax', 'GeoMax', 'Spectra', 'South', 'Hi-Target', 'Other']

export const INTERVALS: { label: string; days: number }[] = [
  { label: '3 months',  days: 90  },
  { label: '6 months',  days: 180 },
  { label: '1 year',    days: 365 },
  { label: '2 years',   days: 730 },
]
