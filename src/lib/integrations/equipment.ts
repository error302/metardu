/**
 * Equipment Calibration Tracker
 * Pure schedule assessment and legacy device storage helpers.
 * The authenticated equipment page uses the server API, not these storage keys.
 */

export type EquipmentType = 'total_station' | 'gnss' | 'level' | 'theodolite' | 'edm' | 'prism_pole' | 'accessory'

import { assessCalibration, type CalibrationAssessment } from '@/lib/equipment/calibration'
export type { CalibrationStatus } from '@/lib/equipment/calibration'

export interface Equipment {
  id: string
  name: string
  type: string
  brand: string
  model: string
  serialNumber: string
  purchaseDate: string         // ISO date string YYYY-MM-DD
  lastCalibrationDate: string  // ISO date string — user sets this on registration or after calibration
  intervalDays: number         // calibration interval in days (e.g. 365 = annual, 180 = 6-monthly)
  location: string
  notes: string
  createdAt: string
  calibrationResult?: CalibrationLog['result']
  recordedNextCalibrationDate?: string | null
  lifecycleStatus?: string
}

export type EquipmentDetails = Omit<Equipment, 'id' | 'createdAt' | 'lastCalibrationDate' | 'calibrationResult' | 'recordedNextCalibrationDate' | 'lifecycleStatus'>

export interface CalibrationLog {
  id: string
  equipmentId: string
  date: string          // ISO date string
  result: 'passed' | 'failed' | 'adjusted' | 'conditional' | 'unknown'
  technician: string
  certificate: string
  notes: string
  nextDate?: string | null
}

export interface EquipmentWithStatus extends Equipment, CalibrationAssessment {}

const STORAGE_KEY = 'metardu_equipment'
const LOG_KEY = 'metardu_calibration_logs'

// ── Storage helpers ──────────────────────────────────────────────────────────

function load(): Equipment[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Equipment[]
  } catch { return [] }
}

function save(items: Equipment[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function loadLogs(): CalibrationLog[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') as CalibrationLog[]
  } catch { return [] }
}

function saveLogs(logs: CalibrationLog[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LOG_KEY, JSON.stringify(logs))
}

// ── Status calculation ───────────────────────────────────────────────────────

export function calcStatus(eq: Equipment): EquipmentWithStatus {
  return { ...eq, ...assessCalibration({ date: eq.lastCalibrationDate, nextDate: eq.recordedNextCalibrationDate, intervalDays: eq.intervalDays, result: eq.calibrationResult }) }
}

export function compareCalibrationSchedules(a: EquipmentWithStatus, b: EquipmentWithStatus): number {
  if (a.daysUntilDue === null && b.daysUntilDue !== null) return -1
  if (a.daysUntilDue !== null && b.daysUntilDue === null) return 1
  return (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0) || a.name.localeCompare(b.name)
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function getAll(): EquipmentWithStatus[] {
  return load().map(calcStatus).sort(compareCalibrationSchedules)
}

export function addEquipment(data: Omit<Equipment, 'id' | 'createdAt'>): Equipment {
  const items = load()
  const item: Equipment = { ...data, id: `EQ_${Date.now()}`, createdAt: new Date().toISOString() }
  save([...items, item])
  return item
}

export function updateEquipment(id: string, updates: Partial<Omit<Equipment, 'id' | 'createdAt'>>): boolean {
  const items = load()
  const idx = items.findIndex(e => e.id === id)
  if (idx === -1) return false
  items[idx] = { ...items[idx], ...updates }
  save(items)
  return true
}

export function deleteEquipment(id: string): void {
  save(load().filter((e) => e.id !== id))
  saveLogs(loadLogs().filter((l) => l.equipmentId !== id))
}

export function logCalibration(data: Omit<CalibrationLog, 'id'>): CalibrationLog {
  const log: CalibrationLog = { ...data, id: `LOG_${Date.now()}` }
  saveLogs([...loadLogs(), log])
  // Update the equipment's lastCalibrationDate
  updateEquipment(data.equipmentId, { lastCalibrationDate: data.date, calibrationResult: data.result, recordedNextCalibrationDate: data.nextDate })
  return log
}

export function getLogsFor(equipmentId: string): CalibrationLog[] {
  return loadLogs().filter((l) => l.equipmentId === equipmentId).sort((a, b) => b.date.localeCompare(a.date))
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
