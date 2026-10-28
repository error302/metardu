import { z } from 'zod'

const DAY = 86_400_000
export function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null
}
export function normalizeCalibrationResult(value: unknown): 'passed' | 'failed' | 'adjusted' | 'conditional' | 'unknown' {
  if (value === 'pass' || value === 'passed') return 'passed'
  if (value === 'fail' || value === 'failed') return 'failed'
  return value === 'adjusted' || value === 'conditional' ? value : 'unknown'
}
export type CalibrationStatus = 'ok' | 'due_soon' | 'overdue' | 'not_recorded' | 'invalid' | 'failed' | 'review_required'
export interface CalibrationAssessment {
  status: CalibrationStatus
  statusReason: string
  nextCalibrationDate: string | null
  daysUntilDue: number | null
  percentUsed: number | null
}
export function assessCalibration(input: { date?: string | null; nextDate?: string | null; intervalDays: number; result?: unknown }, now = new Date()): CalibrationAssessment {
  const unknown = (status: CalibrationStatus, statusReason: string): CalibrationAssessment => ({ status, statusReason, nextCalibrationDate: null, daysUntilDue: null, percentUsed: null })
  if (!input.date) return unknown('not_recorded', 'No calibration record is retained for this instrument.')
  const date = calendarDay(input.date), today = calendarDay(now.toISOString().slice(0, 10))
  if (date === null || today === null || date > today) return unknown('invalid', 'Review the recorded calibration date.')
  let due: number | null
  if (input.nextDate !== undefined) due = input.nextDate ? calendarDay(input.nextDate) : null
  else {
    if (!Number.isInteger(input.intervalDays) || input.intervalDays < 1 || input.intervalDays > 36500) return unknown('invalid', 'Declare a valid calibration interval.')
    due = date + input.intervalDays * DAY
  }
  if (due === null || due <= date || !Number.isFinite(due)) return unknown('invalid', 'Review the retained next calibration date.')
  const nextCalibrationDate = new Date(due).toISOString().slice(0, 10)
  const result = normalizeCalibrationResult(input.result)
  if (result !== 'passed') return {
    ...unknown(result === 'failed' ? 'failed' : 'review_required', result === 'failed' ? 'The latest calibration record reports a failed result.' : result === 'adjusted' ? 'The instrument was adjusted; confirm an accepted calibration result before use.' : 'The retained calibration result needs review.'),
    nextCalibrationDate,
  }
  const daysUntilDue = Math.round((due - today) / DAY)
  return { status: daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 30 ? 'due_soon' : 'ok', statusReason: 'Schedule based on the retained, user-reported calibration record.', nextCalibrationDate, daysUntilDue, percentUsed: Math.min(100, Math.max(0, Math.round((today - date) / (due - date) * 100))) }
}

const date = z.string().refine(value => calendarDay(value) !== null, 'Enter a valid calendar date as YYYY-MM-DD')
const optionalDate = z.union([date, z.literal(''), z.null()]).optional()
const interval = z.number().int().min(1).max(36500)
const text = (max: number) => z.string().trim().max(max)
export const equipmentRegistrationSchema = z.object({
  name: text(200).min(1), type: text(50).min(1), manufacturer: text(200).optional(), model: text(200).optional(),
  serialNumber: text(200).optional(), purchaseDate: optionalDate, purchaseCost: z.number().finite().nonnegative().optional(),
  status: z.enum(['active', 'inactive', 'maintenance']).optional(), notes: text(5000).optional(),
  intervalDays: interval.prefault(365), location: text(200).optional(),
}).strict()
export const equipmentUpdateSchema = equipmentRegistrationSchema.partial().extend({
  intervalDays: interval.optional(),
  serial_number: text(200).optional(), purchase_date: optionalDate, interval_days: interval.optional(),
}).strict()
export const calibrationInputSchema = z.object({
  calibrationDate: date.refine(value => value <= new Date().toISOString().slice(0, 10), 'Calibration date cannot be in the future'),
  nextCalibrationDate: date.optional(),
  results: z.enum(['pass', 'passed', 'fail', 'failed', 'adjusted', 'conditional']),
  calibratedBy: text(200).optional(), calibrationLab: text(200).optional(), certificateNumber: text(200).optional(),
  notes: text(5000).optional(), reportUrl: z.string().url().max(2000).optional(),
}).strict().refine(value => !value.nextCalibrationDate || value.nextCalibrationDate > value.calibrationDate, { message: 'Next calibration date must follow the recorded calibration date', path: ['nextCalibrationDate'] })

export function nextCalibrationDate(recordedDate: string, intervalDays: number): string {
  const parsed = calendarDay(recordedDate)
  if (parsed === null || !Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 36500) throw new Error('A valid recorded date and adopted interval are required')
  return new Date(parsed + intervalDays * DAY).toISOString().slice(0, 10)
}
