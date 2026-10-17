import { waitFor } from '@testing-library/react'
import { INSTRUMENT_PRESETS, TotalStationConnection } from '../totalStationSerial'

const originalSerial = navigator.serial
afterAll(() => Object.defineProperty(navigator, 'serial', { configurable: true, value: originalSerial }))

it('opens the selected protocol settings and reports transport termination', async () => {
  const port = { open: jest.fn(async () => {}), close: jest.fn(async () => {}),
    readable: { getReader: () => ({ read: async () => ({ done: true }), cancel: async () => {}, releaseLock: () => {} }) },
    writable: { getWriter: () => ({ write: async () => {}, releaseLock: () => {} }) } }
  Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port } })
  const onState = jest.fn()
  const connection = new TotalStationConnection({ ...INSTRUMENT_PRESETS.leica, baudRate: 19200 }, undefined, onState)
  await connection.connect()
  expect(port.open).toHaveBeenCalledWith({ baudRate: 19200, dataBits: 7, stopBits: 1, parity: 'even' })
  await waitFor(() => expect(onState).toHaveBeenLastCalledWith(false))
  expect(connection.isConnected()).toBe(false)
  await connection.disconnect()
  expect(port.close).toHaveBeenCalled()
})

it('retains an unrecognized raw frame for diagnosis rather than inventing measurements', async () => {
  const read = jest.fn().mockResolvedValueOnce({ value: new TextEncoder().encode('unknown frame\r\n'), done: false }).mockResolvedValue({ done: true })
  const port = { open: async () => {}, close: async () => {}, readable: { getReader: () => ({ read, cancel: async () => {}, releaseLock: () => {} }) } }
  Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port } })
  const onObservation = jest.fn()
  const connection = new TotalStationConnection(INSTRUMENT_PRESETS.generic, onObservation)
  await connection.connect()
  await waitFor(() => expect(onObservation).toHaveBeenCalledWith(expect.objectContaining({ raw: 'unknown frame', parsed: null })))
  await connection.disconnect()
})
