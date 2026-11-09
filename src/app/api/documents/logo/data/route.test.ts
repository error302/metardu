/** @jest-environment node */
import { getServerSession } from 'next-auth'
import { setAuthenticatedDatabaseContext } from '@/lib/auth/requestContext'
import { getSubscription } from '@/lib/subscription/subscriptionEngine'
import { resolveCompanyLogo } from '@/lib/documents/resolve-logo'
import { GET } from './route'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/auth/requestContext', () => ({ setAuthenticatedDatabaseContext: jest.fn() }))
jest.mock('@/lib/subscription/subscriptionEngine', () => ({ getSubscription: jest.fn() }))
jest.mock('@/lib/documents/resolve-logo', () => ({ resolveCompanyLogo: jest.fn() }))

const session = { user: { id: 'synthetic-user', email: 'surveyor@example.test' }, expires: '' }

beforeEach(() => jest.resetAllMocks())

test('anonymous and free accounts cannot retrieve a stored logo', async () => {
  jest.mocked(getServerSession).mockResolvedValueOnce(null).mockResolvedValueOnce(session)
  jest.mocked(getSubscription).mockResolvedValue(null)
  expect((await GET()).status).toBe(401)
  expect((await GET()).status).toBe(403)
  expect(resolveCompanyLogo).not.toHaveBeenCalled()
})

test('a paid account can only retrieve its own private logo with a sandboxed response', async () => {
  jest.mocked(getServerSession).mockResolvedValue(session)
  const subscription = { plan: 'pro', status: 'active', trialEndsAt: null, periodStart: '', periodEnd: '',
    paymentMethod: null, currency: 'KES', isUnlimitedProjects: false, isUnlimitedPoints: false,
    includedSeats: 1, purchasedExtraSeats: 0, maxTeamMembers: 1, isPerSeat: false } as const
  jest.mocked(getSubscription).mockResolvedValue(subscription)
  jest.mocked(resolveCompanyLogo).mockResolvedValueOnce(null).mockResolvedValueOnce({
    data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), filename: 'company.svg', mimeType: 'image/svg+xml',
  })
  expect((await GET()).status).toBe(404)
  const response = await GET()
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toBe('image/svg+xml')
  expect(response.headers.get('Content-Disposition')).toContain('attachment')
  expect(response.headers.get('Content-Security-Policy')).toContain('sandbox')
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.text()).toContain('<svg')
  expect(setAuthenticatedDatabaseContext).toHaveBeenCalledWith(session.user.id)
  expect(resolveCompanyLogo).toHaveBeenCalledWith(session.user.id, 'pro')
})
