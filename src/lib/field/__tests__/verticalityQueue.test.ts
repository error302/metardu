import { createVerticalityCapture } from '../verticalityCapture'
import Papa from 'papaparse'
import { deliverDevicePlumbReading, exportDevicePlumbCsv, listDevicePlumbReadings, plumbDeliveryPayload, retainDevicePlumbReading } from '../verticalityQueue'

const fixtureCrs = 'EPSG:21037'
const id = 'd8aa0101-6066-4700-ae25-302c05d8bf81'
const input = { projectId: 'p', definitionId: null, label: '=C1', level: null, horizontalCrs: fixtureCrs, capturedCrs: fixtureCrs, verticalDatum: null, capturedVerticalDatum: null, capturedAt: null, base: { easting: 500000.0001234567, northing: 9800000, rl: -2 }, top: { easting: 500000.0041234567, northing: 9800000, rl: 1 }, horizontalUncertaintyM: null, heightUncertaintyM: null, criteria: null, instrument: null, notes: null }
beforeEach(() => localStorage.clear())
test('device storage preserves raw precision, unknown criteria and account/project isolation', () => {
  retainDevicePlumbReading('alice', createVerticalityCapture(input), id)
  expect(listDevicePlumbReadings('alice', 'p')[0].snapshot.base.easting).toBe(500000.0001234567)
  expect(listDevicePlumbReadings('alice', 'p')[0].snapshot.criteria).toBeNull()
  expect(listDevicePlumbReadings('bob', 'p')).toEqual([])
  expect(listDevicePlumbReadings('alice', 'other')).toEqual([])
})
test('identity cannot be reused to replace another measured reading', () => {
  retainDevicePlumbReading('alice', createVerticalityCapture(input), id)
  expect(() => retainDevicePlumbReading('alice', createVerticalityCapture({ ...input, top: { ...input.top, easting: input.top.easting + 0.01 } }), id)).toThrow(/reused|changed/i)
  expect(listDevicePlumbReadings('alice', 'p')).toHaveLength(1)
})
test('delivery failures keep the exact reading and stable ID for retry', async () => {
  const original = retainDevicePlumbReading('alice', createVerticalityCapture(input), id)
  const offline = jest.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
  const result = await deliverDevicePlumbReading('alice', 'p', id, offline)
  expect(result.state).toBe('queued')
  expect(plumbDeliveryPayload(listDevicePlumbReadings('alice', 'p')[0])).toEqual(plumbDeliveryPayload(original))
  expect(plumbDeliveryPayload(result)).toMatchObject({ clientReadingId: id, capturedBy: 'alice', baseEasting: 500000.0001234567, baseRL: -2, criteria: null, capturedAt: null })
})
test('only a matching server capture confirms delivery; a success flag alone is insufficient', async () => {
  const snapshot = createVerticalityCapture(input)
  retainDevicePlumbReading('alice', snapshot, id)
  const malformed = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({ data: { id: 'server-1' } }) })) as unknown as typeof fetch
  expect((await deliverDevicePlumbReading('alice', 'p', id, malformed)).state).toBe('queued')
  const matching = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({ data: { id: 'server-1', captureSnapshot: snapshot } }) })) as unknown as typeof fetch
  expect((await deliverDevicePlumbReading('alice', 'p', id, matching)).state).toBe('synced')
  expect(listDevicePlumbReadings('alice', 'p')[0].serverId).toBe('server-1')
})
test('CSV distinguishes local-only observations and preserves negative numeric levels', () => {
  const row = retainDevicePlumbReading('alice', createVerticalityCapture(input), id)
  const csv = exportDevicePlumbCsv([row])
  expect(csv).toContain('DEVICE ONLY - NOT ON SERVER REGISTER')
  expect(csv).toContain('"500000.0001234567"')
  expect(csv).toContain('"-2"')
  expect(csv).toContain('"\'=C1"')
  expect(csv).toContain('"INFO"')
})
test('the native CSV parser reads measurement and reference columns without losing signed levels or raw precision', () => {
  const row = retainDevicePlumbReading('alice', createVerticalityCapture(input), id)
  const csv = exportDevicePlumbCsv([row])
  expect(csv.startsWith('\uFEFF')).toBe(true)
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  expect(parsed.errors).toEqual([])
  expect(Number(parsed.data[0].Base_E_m)).toBe(500000.0001234567)
  expect(Number(parsed.data[0].Base_RL_m)).toBe(-2)
  expect(parsed.data[0].Numerical_result).toBe('INFO')
  expect(parsed.data[0].Max_offset_m).toBe('')
  expect(parsed.data[0].Captured_UTC).toBe('')
})
