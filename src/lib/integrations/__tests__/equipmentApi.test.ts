/** @jest-environment node */
import { createEquipmentApi, fetchAllEquipment, fetchCalibrationLogs, logCalibrationApi, updateEquipmentApi } from '../equipmentApi'

const originalFetch = global.fetch
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>()
const row = { id: 'instrument-a', name: 'SYNTHETIC GNSS', type: 'gnss_rover', created_at: '2026-10-01T00:00:00Z', status: 'active', interval_days: 180,
  last_calibrated: null, next_calibration: null, calibration_result: null }
const respond = (value: unknown, status = 200) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }))
beforeEach(() => { fetchMock.mockReset(); global.fetch = fetchMock })
afterAll(() => { global.fetch = originalFetch })

test('the actual top-level API shape preserves a new instrument without invented calibration', async () => {
  respond({ equipment: [row] })
  expect(await fetchAllEquipment()).toEqual([expect.objectContaining({ id: row.id, status: 'not_recorded', daysUntilDue: null, calibrationResult: 'unknown' })])
})
test('an absent or malformed equipment response is an error, not a successful empty list', async () => {
  respond({ message: 'unavailable' })
  await expect(fetchAllEquipment()).rejects.toThrow('could not be verified')
})
test('unknown result history is retained without manufacturing a passed result', async () => {
  respond({ calibrations: [{ id: 'record', equipment_id: row.id, calibration_date: '2026-10-01', next_calibration_date: '2027-04-01', results: null }] })
  expect(await fetchCalibrationLogs(row.id)).toEqual([expect.objectContaining({ result: 'unknown', nextDate: '2027-04-01' })])
})
test('history from another instrument is rejected', async () => {
  respond({ calibrations: [{ id: 'record', equipment_id: 'other', calibration_date: '2026-10-01', next_calibration_date: '2027-04-01', results: 'pass' }] })
  await expect(fetchCalibrationLogs(row.id)).rejects.toThrow('another instrument')
})
test('calibration logging leaves due-date derivation to the owner-bound server interval', async () => {
  respond({ calibration: { id: 'record', equipment_id: row.id, calibration_date: '2026-10-01', next_calibration_date: '2027-03-30', results: 'failed' } })
  expect(await logCalibrationApi({ equipmentId: row.id, date: '2026-10-01', result: 'failed', technician: 'SYNTHETIC', certificate: '', notes: '' })).toMatchObject({ result: 'failed', nextDate: '2027-03-30' })
  expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ calibrationDate: '2026-10-01', calibratedBy: 'SYNTHETIC', certificateNumber: '', results: 'failed', notes: '' }))
})
test('a mismatched save acknowledgement cannot close an editor as saved', async () => {
  respond({ equipment: { ...row, id: 'other' } })
  await expect(updateEquipmentApi(row.id, { name: 'Renamed' })).rejects.toThrow('another instrument')
})
test('registration records metadata only and a valid zero-calibration response remains usable', async () => {
  respond({ equipment: row })
  const saved = await createEquipmentApi({ name: row.name, type: row.type, brand: '', model: '', serialNumber: '', purchaseDate: '', intervalDays: 180, location: '', notes: '' })
  expect(saved.lastCalibrationDate).toBe('')
  expect(fetchMock.mock.calls[0][1]?.body).not.toContain('lastCalibrationDate')
})
