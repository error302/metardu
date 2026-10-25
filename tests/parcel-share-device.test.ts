import {
  readParcelSharePending,
  prepareParcelSharePending,
  clearParcelSharePending,
} from '@/lib/scheme/parcelShareDevice'
import type { ParcelShareCommand } from '@/lib/scheme/parcelShareContract'
const body: ParcelShareCommand = {
  projectId: '33333333-3333-4333-8333-333333333333',
  expectedUserId: '11111111-1111-4111-8111-111111111111',
  requestId: '22222222-2222-4222-8222-222222222222',
  exportRequestId: '44444444-4444-4444-8444-444444444444',
  snapshotHash: 'a'.repeat(64),
  durationDays: 7,
  authorityToShare: true,
  key: 'A'.repeat(43),
}
function storage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}
const lock = async <T>(_key: string, work: () => T | Promise<T>) => work()
it('retains the exact key and request before transmission and reuses them on retry', async () => {
  const device = storage(),
    first = await prepareParcelSharePending(body, device, lock)
  expect(first).toEqual(body)
  const retry = await prepareParcelSharePending(
    {
      ...body,
      requestId: '55555555-5555-4555-8555-555555555555',
      key: 'B'.repeat(43),
    },
    device,
    lock,
  )
  expect(retry).toEqual(body)
  expect(
    readParcelSharePending(body.expectedUserId, body.projectId, device),
  ).toEqual(body)
})
it('preserves a conflicting or corrupt device request instead of replacing the key', async () => {
  const device = storage()
  await prepareParcelSharePending(body, device, lock)
  await expect(
    prepareParcelSharePending({ ...body, durationDays: 1 }, device, lock),
  ).rejects.toThrow()
  const [key] = device.values.keys()
  device.values.set(key, 'corrupt')
  expect(() =>
    readParcelSharePending(body.expectedUserId, body.projectId, device),
  ).toThrow()
  expect(device.values.get(key)).toBe('corrupt')
})
it('refuses to send if storage does not acknowledge the request', async () => {
  const device = storage()
  device.setItem = () => {}
  await expect(prepareParcelSharePending(body, device, lock)).rejects.toThrow()
})
it('clears only the exact settled request without erasing another tab intent', async () => {
  const device = storage()
  await prepareParcelSharePending(body, device, lock)
  expect(
    await clearParcelSharePending(
      { ...body, key: 'B'.repeat(43) },
      device,
      lock,
    ),
  ).toBe(false)
  expect(await clearParcelSharePending(body, device, lock)).toBe(true)
  expect(
    readParcelSharePending(body.expectedUserId, body.projectId, device),
  ).toBeNull()
})
