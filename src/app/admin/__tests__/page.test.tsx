import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdminDashboardPage from '../page'
import type { DashboardData } from '@/lib/admin/dashboardContract'
const mockGet = jest.fn<Promise<unknown>, unknown[]>()
const mockPatch = jest.fn<Promise<unknown>, unknown[]>()
const mockPost = jest.fn<Promise<unknown>, unknown[]>()
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { role: 'super_admin' } } }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('@/components/admin/SystemHealthPanel', () => () => null)
jest.mock('@/components/admin/charts/AdminCharts', () => ({ RevenueLineChart: () => null }))
jest.mock('@/lib/api/client', () => ({ apiGet: (...args: unknown[]) => mockGet(...args), apiPatch: (...args: unknown[]) => mockPatch(...args), apiPost: (...args: unknown[]) => mockPost(...args), ApiError: class extends Error {} }))
const fixture: DashboardData = {
  users: { total: 18, newThisMonth: 12 }, projects: { total: 16, byStatus: { active: 16 } }, parcels: 0, beacons: 0,
  revenue: { total: 100, byMonth: [], byCurrency: [{ currency: 'KES', total: 100 }, { currency: 'USD', total: 5 }] },
  recentSignups: [], iskPendingCount: 1, iskQueue: [{ id: 'u1', name: 'Amina', email: 'amina@example.com', iskNumber: 'ISK123', submittedAt: '2026-10-15', updatedAt: '2026-10-15 01:00:00.123456+00' }],
  activeSubscriptions: { pro: 1 }, trialSubscriptions: 2, submissionsThisMonth: 0,
  generatedAt: '2026-10-15T01:00:00Z',
  operations: { accounts: 4, syntheticAccounts: 14, unverifiedEmails: 1, pendingClaims: 0, failedPayments30d: 0, expiringSubscriptions7d: 0, openFeedback: 0, renewals: [], feedback: [], announcements: [] },
  system: { database: { status: 'healthy', latencyMs: 1 }, uptime: 100, memory: { heapUsedMb: 1, heapTotalMb: 2, rssMb: 3 }, responseTimeMs: 1 },
}
beforeEach(() => { window.location.hash = ''; mockGet.mockReset().mockResolvedValue(fixture); mockPost.mockReset().mockResolvedValue({ id: 'a1' }); mockPatch.mockReset().mockResolvedValue({ verified: true }) })

it('shows customer and test counts distinctly, with separate payment currencies', async () => {
  render(<AdminDashboardPage />)
  expect(await screen.findByRole('heading', { name: 'Owner’s workspace' })).toBeInTheDocument()
  expect(screen.getByText('14 labelled test accounts excluded')).toBeInTheDocument()
  expect(screen.getByText('USD 5.00')).toBeInTheDocument()
  expect(screen.queryByText('Active Users')).not.toBeInTheDocument()
})
it('sends the exact database version with professional verification', async () => {
  render(<AdminDashboardPage />)
  await screen.findByRole('heading', { name: 'Owner’s workspace' })
  fireEvent.click(screen.getByRole('link', { name: 'Customers' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Approve ISK for Amina' }))
  await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/api/admin/users/u1/verify-isk', expect.anything(), { verified: true, updated_at: '2026-10-15 01:00:00.123456+00' }))
})
it('requires a fresh announcement review after changing the audience', async () => {
  render(<AdminDashboardPage />)
  await screen.findByRole('heading', { name: 'Owner’s workspace' })
  fireEvent.click(screen.getByRole('link', { name: 'Communications' }))
  fireEvent.change(screen.getByLabelText('Announcement title'), { target: { value: 'Scheduled maintenance' } })
  fireEvent.change(screen.getByLabelText('Announcement message'), { target: { value: 'Please save your work before maintenance.' } })
  expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Announcement audience'), { target: { value: 'team' } })
  expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
  await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/admin/announcements', expect.anything(), expect.objectContaining({ target: 'team' })))
})
