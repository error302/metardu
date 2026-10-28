import { calcStatus, type Equipment } from '../equipment'
import { assessCalibration, calibrationInputSchema, equipmentRegistrationSchema, equipmentUpdateSchema } from '@/lib/equipment/calibration'

const equipment: Equipment = { id: 'synthetic-instrument', name: 'SYNTHETIC total station', type: 'total_station', brand: '', model: '', serialNumber: '', purchaseDate: '', lastCalibrationDate: '', intervalDays: 180, location: '', notes: '', createdAt: '2026-01-01T00:00:00Z' }
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-27T12:00:00Z')) })
afterEach(() => jest.useRealTimers())

test('an instrument without a calibration date has no invented countdown or current status', () => {
  expect(calcStatus(equipment)).toMatchObject({ status: 'not_recorded', nextCalibrationDate: null, daysUntilDue: null, percentUsed: null })
})
test.each(['invalid-date', '2026-02-30', '2026-12-01'])('invalid or future observed calibration date %s cannot become current', lastCalibrationDate => {
  expect(calcStatus({ ...equipment, lastCalibrationDate })).toMatchObject({ status: 'invalid', daysUntilDue: null })
})
test.each([0, -1, NaN, Infinity, 1.5])('invalid interval %p cannot produce a countdown', intervalDays => {
  expect(calcStatus({ ...equipment, lastCalibrationDate: '2026-10-01', intervalDays })).toMatchObject({ status: 'invalid', daysUntilDue: null })
})

test.each(['failed', 'fail', 'adjusted', null, 'unrecognized'])('outcome %p never becomes current even with a future due date', result => {
  const actual = assessCalibration({ date: '2026-10-01', nextDate: '2027-04-01', intervalDays: 180, result })
  expect(actual.status).toBe(result === 'failed' || result === 'fail' ? 'failed' : 'review_required')
  expect(actual.daysUntilDue).toBeNull()
})
test('the retained due date survives later interval changes', () => {
  expect(calcStatus({ ...equipment, lastCalibrationDate: '2026-10-01', intervalDays: 730, recordedNextCalibrationDate: '2026-11-27', calibrationResult: 'passed' })).toMatchObject({ status: 'ok', nextCalibrationDate: '2026-11-27', daysUntilDue: 31 })
})
test.each([['2026-10-26', 'overdue', -1], ['2026-10-27', 'due_soon', 0], ['2026-11-26', 'due_soon', 30], ['2026-11-27', 'ok', 31]])('due boundary %s is stable throughout the UTC calendar day', (nextDate, status, daysUntilDue) => {
  for (const now of ['2026-10-27T00:01:00Z', '2026-10-27T23:59:00Z']) expect(assessCalibration({ date: '2026-10-01', nextDate, result: 'pass', intervalDays: 180 }, new Date(now))).toMatchObject({ status, daysUntilDue })
})
test('missing and contradictory evidence is refused without changing an existing calibration', () => {
  expect(calibrationInputSchema.safeParse({}).success).toBe(false)
  expect(calibrationInputSchema.safeParse({ calibrationDate: '2026-10-01', nextCalibrationDate: '2026-09-30', results: 'pass' }).success).toBe(false)
  expect(equipmentRegistrationSchema.safeParse({ name: 'Instrument', type: 'gnss', lastCalibrationDate: '2026-10-01' }).success).toBe(false)
  expect(equipmentUpdateSchema.parse({ name: 'Renamed instrument' })).toEqual({ name: 'Renamed instrument' })
})
