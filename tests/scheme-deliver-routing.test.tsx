import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'
import StagePage from '@/app/project/[id]/StagePage'
import { getAuthUser } from '@/lib/auth/session'
import {requireProjectReadAccess} from '@/lib/auth/ownership'
import { createClient } from '@/lib/api-client/server'
const actor = '11111111-1111-4111-8111-111111111111',
  project = '33333333-3333-4333-8333-333333333333'
jest.mock('next/navigation', () => ({
  redirect: jest.fn((target: string) => {
    throw new Error(`redirect:${target}`)
  }),
}))
jest.mock('@/lib/auth/session', () => ({
  getAuthUser: jest.fn(),
  isPlatformAdmin: async () => false,
}))
jest.mock('@/lib/auth/requestContext', () => ({
  setAuthenticatedDatabaseContext: jest.fn(),
  resolveAuthenticatedOrganization: async()=>null,
}))
jest.mock('@/lib/api-client/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/auth/ownership',()=>({requireProjectReadAccess:jest.fn()}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/app/project/[id]/StageShell', () => ({
  __esModule: true,
  default: () => <div>General workspace</div>,
}))
jest.mock('@/components/scheme/SchemeExportReview', () => ({
  __esModule: true,
  default: ({ projectId }: { projectId: string }) => (
    <h1>Scheme registered outputs {projectId}</h1>
  ),
}))
const single = jest.fn(),
  query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single,
  }
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(requireProjectReadAccess).mockResolvedValue({ok:true,projectUserId:actor})
  jest
    .mocked(getAuthUser)
    .mockResolvedValue({ id: actor } as Awaited<ReturnType<typeof getAuthUser>>)
  jest
    .mocked(createClient)
    .mockResolvedValue({ from: () => query } as unknown as Awaited<
      ReturnType<typeof createClient>
    >)
  single.mockResolvedValue({
    data: { id: project, user_id:actor, name: 'SYNTHETIC scheme', project_type: 'scheme' },
    error: null,
  })
})
it('opens the scheme output workflow without redirecting or showing generic export generators', async () => {
  render(
    await StagePage({
      params: Promise.resolve({ id: project }),
      stageId: 'deliver',
    }),
  )
  expect(
    screen.getByRole('heading', {
      name: `Scheme registered outputs ${project}`,
    }),
  ).toBeInTheDocument()
  expect(screen.queryByText('General workspace')).not.toBeInTheDocument()
  expect(redirect).not.toHaveBeenCalled()
  expect(requireProjectReadAccess).toHaveBeenCalledWith(project, actor)
  expect(query.eq).toHaveBeenCalledWith('id',project)
})
it('retains scheme routing for other generic stages', async () => {
  await expect(
    StagePage({ params: Promise.resolve({ id: project }), stageId: 'observe' }),
  ).rejects.toThrow(`redirect:/project/${project}/scheme`)
})
it('requires sign-in before looking up the project', async () => {
  jest.mocked(getAuthUser).mockResolvedValue(null)
  await expect(
    StagePage({ params: Promise.resolve({ id: project }), stageId: 'deliver' }),
  ).rejects.toThrow('redirect:/login')
  expect(createClient).not.toHaveBeenCalled()
})
it('does not expose an unavailable or unowned project', async () => {
  single.mockResolvedValue({ data: null, error: { message: 'Unavailable' } })
  await expect(
    StagePage({ params: Promise.resolve({ id: project }), stageId: 'deliver' }),
  ).rejects.toThrow('redirect:/dashboard')
})

it('rejects a failed shared-project admission before querying project contents',async()=>{
 jest.mocked(requireProjectReadAccess).mockResolvedValue({ok:false})
 await expect(StagePage({params:Promise.resolve({id:project}),stageId:'deliver'})).rejects.toThrow('redirect:/dashboard')
 expect(createClient).not.toHaveBeenCalled()
})
it('retains the ownership-review gate for an unassigned legacy record',async()=>{
 single.mockResolvedValue({data:{id:project,user_id:null,project_type:'scheme'},error:null})
 await expect(StagePage({params:Promise.resolve({id:project}),stageId:'deliver'})).rejects.toThrow('redirect:/dashboard')
})
