import { render, screen, within } from '@testing-library/react'
import DashboardPage from './page'

type QueryResult = { data: unknown[] | null; error: { message: string } | null }
type MockBuilder = { select: () => MockBuilder; eq: () => MockBuilder; order: () => Promise<QueryResult>; in: () => Promise<QueryResult> }
const mockFrom = jest.fn<MockBuilder, [string]>()
const mockSubscription = jest.fn<Promise<{ plan: string; status: string; trialEndsAt: string | null }>, unknown[]>()
const mockUser = jest.fn<Promise<{ id: string; name: string; email: string } | null>, []>()
const mockPlatformAdmin = jest.fn<Promise<boolean>, []>()

jest.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`) } }))
jest.mock('@/lib/auth/session', () => ({ getAuthUser: () => mockUser(), isPlatformAdmin: () => mockPlatformAdmin() }))
jest.mock('@/lib/api-client/server', () => ({ createClient: async () => ({ from: (table: string) => mockFrom(table) }) }))
jest.mock('@/lib/db', () => ({ db: { query: async () => ({ rows: [{ email_verified: true }] }) }, setCurrentUserId: jest.fn() }))
jest.mock('@/lib/logger', () => ({ log: jest.fn() }))
jest.mock('@/lib/subscription/subscriptionEngine', () => ({ getSubscription: (...args: unknown[]) => mockSubscription(...args) }))
jest.mock('@/lib/i18n/server', () => ({ getServerTranslator: async () => (key: string) => ({
  'dashboard.title': 'Dashboard',
  'dashboard.newProject': 'New project',
  'dashboard.upgradeToCreateMore': 'Upgrade to create more',
  'project.open': 'Open project',
}[key] || key) }))
jest.mock('@/components/shared/ConnectivityIndicator', () => ({ ConnectivityIndicator: () => null }))
jest.mock('@/components/shared/OnboardingWrapper', () => () => null)
jest.mock('@/components/shared/ProjectWorkflowBadge', () => () => null)
jest.mock('@/components/dashboard/ActivityFeed', () => ({ ActivityFeed: () => null }))
jest.mock('@/components/dashboard/DashboardSearch', () => () => null)
jest.mock('@/components/dashboard/EmailVerificationNotice', () => () => null)

const project = { id: 'p1', name: 'Road survey', created_at: '2026-10-17T12:00:00Z' }
const mockResults: Record<string, QueryResult> = {}

beforeEach(() => {
  mockPlatformAdmin.mockReset().mockResolvedValue(false)
  mockUser.mockReset().mockResolvedValue({ id: 'owner-1', name: 'Amina Surveyor', email: 'amina@example.com' })
  mockSubscription.mockReset().mockResolvedValue({ plan: 'pro', status: 'active', trialEndsAt: null })
  mockResults.projects = { data: [project], error: null }
  mockResults.survey_points = { data: [{ project_id: 'p1' }, { project_id: 'p1' }], error: null }
  mockResults.parcels = { data: [{ project_id: 'p1' }], error: null }
  mockFrom.mockReset().mockImplementation((table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: async () => mockResults[table],
      in: async () => mockResults[table],
    }
    return builder
  })
})

it('offers platform administrators a direct administration switch', async () => {
  mockPlatformAdmin.mockResolvedValue(true)
  render(await DashboardPage())
  expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin')
})

it('keeps the administration switch out of an ordinary workspace', async () => {
  render(await DashboardPage())
  expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument()
})

function totals() {
  return within(screen.getByRole('region', { name: 'Workspace totals' })).getAllByRole('article')
}

it('keeps every total unavailable after a failed project-list query', async () => {
  mockResults.projects = { data: null, error: { message: 'Database unavailable' } }
  render(await DashboardPage())
  expect(screen.getByRole('alert')).toHaveTextContent('Your projects could not be loaded')
  for (const metric of totals()) {
    expect(within(metric).getByText('—')).toBeInTheDocument()
    expect(within(metric).queryByText('0')).not.toBeInTheDocument()
  }
  expect(screen.queryByRole('link', { name: 'New project' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Create your first project/ })).not.toBeInTheDocument()
})

it('leaves projects usable when a count query fails without inventing totals', async () => {
  mockResults.parcels = { data: null, error: { message: 'Counts unavailable' } }
  render(await DashboardPage())
  const metrics = totals()
  expect(within(metrics[0]).getByText('1')).toBeInTheDocument()
  expect(within(metrics[1]).getByText('—')).toBeInTheDocument()
  expect(within(metrics[2]).getByText('—')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: project.name })).toHaveAttribute('href', '/project/p1')
  expect(screen.getByRole('status')).toHaveTextContent('totals could not be refreshed')
})

it('aggregates only the loaded project records into workspace totals', async () => {
  mockResults.projects.data = [project, { ...project, id: 'p2', name: 'South road survey' }]
  mockResults.survey_points.data = [{ project_id: 'p1' }, { project_id: 'p1' }, { project_id: 'p2' }]
  render(await DashboardPage())
  const metrics = totals()
  expect(within(metrics[0]).getByText('2')).toBeInTheDocument()
  expect(within(metrics[1]).getByText('3')).toBeInTheDocument()
  expect(within(metrics[2]).getByText('1')).toBeInTheDocument()
})

it('shows true zeros and the starting workflow for an empty successful project list', async () => {
  mockResults.projects.data = []
  render(await DashboardPage())
  for (const metric of totals()) expect(within(metric).getByText('0')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Create your first project/ })).toHaveAttribute('href', '/project/new')
  expect(mockFrom).not.toHaveBeenCalledWith('survey_points')
})

it('keeps existing project access and avoids an upsell when subscription lookup fails', async () => {
  mockSubscription.mockRejectedValue(new Error('Subscription temporarily unavailable'))
  render(await DashboardPage())
  expect(screen.getByRole('status')).toHaveTextContent('Subscription details could not be refreshed')
  expect(screen.getByRole('link', { name: project.name })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Upgrade to create more' })).not.toBeInTheDocument()
})

it('does not render a NaN countdown for an invalid trial end date', async () => {
  mockSubscription.mockResolvedValue({ plan: 'pro', status: 'trial', trialEndsAt: 'invalid-date' })
  render(await DashboardPage())
  expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  expect(screen.queryByText(/days remaining/)).not.toBeInTheDocument()
})

it('redirects signed-out users before accessing project data', async () => {
  mockUser.mockResolvedValue(null)
  await expect(DashboardPage()).rejects.toThrow('REDIRECT:/login')
  expect(mockFrom).not.toHaveBeenCalled()
})
