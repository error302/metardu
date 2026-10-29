import { render, screen } from '@testing-library/react'
import StagePage from '@/app/project/[id]/StagePage'

let mockContextUser: string | null = null
jest.mock('@/lib/auth/session', () => ({ getAuthUser: async () => ({ id: 'owner', email: 'synthetic@example.invalid' }), isPlatformAdmin: async () => false }))
jest.mock('@/lib/auth/requestContext', () => ({ setAuthenticatedDatabaseContext: (id: string) => { mockContextUser = id }, resolveAuthenticatedOrganization: async()=>null }))
jest.mock('@/lib/auth/ownership',()=>({requireProjectReadAccess:jest.fn().mockResolvedValue({ok:true,projectUserId:'owner'})}))
jest.mock('@/lib/api-client/server', () => ({ createClient: async () => ({ from: () => {
  const builder = {
    select: () => builder, eq: () => builder,
    single: async () => ({ data: { id: 'project', user_id:'owner', name: 'Synthetic survey', datum: 'Arc 1960', utm_zone: 37, hemisphere: 'S' }, error: null }),
    limit: async () => ({ data: [] }),
  }
  return builder
} }) }))
jest.mock('@/lib/db', () => ({ db: { query: async () => ({ rows: [{ point_count: mockContextUser === 'owner' ? 5 : 0, batch_count: 1, parcel_count: 0, event_count: 0, last_evidence_date: null }] }) } }))
jest.mock('@/app/project/[id]/StageShell', () => ({ __esModule: true, default: ({ summary }: { summary: { pointCount: number } }) => <p>{summary.pointCount} survey points</p> }))

test('the overview summary reads under the admitted owner rather than an anonymous database context', async () => {
  mockContextUser = null
  render(await StagePage({ params: Promise.resolve({ id: 'project' }), stageId: 'overview' }))
  expect(screen.getByText('5 survey points')).toBeInTheDocument()
})
