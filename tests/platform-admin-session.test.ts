import { getServerSession } from 'next-auth'
import { isPlatformAdmin } from '@/lib/auth/session'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

test.each(['admin', 'super_admin'])('%s can open platform administration', async role => {
  jest.mocked(getServerSession).mockResolvedValue({ user: { role } })
  expect(await isPlatformAdmin()).toBe(true)
})

test.each(['org_admin', 'surveyor', 'viewer', undefined])('%s stays outside platform administration', async role => {
  jest.mocked(getServerSession).mockResolvedValue({ user: { role } })
  expect(await isPlatformAdmin()).toBe(false)
})

test('a missing session has no platform administration access', async () => {
  jest.mocked(getServerSession).mockResolvedValue(null)
  expect(await isPlatformAdmin()).toBe(false)
})
