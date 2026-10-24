import { render, screen } from '@testing-library/react'
import ProjectsPage from './page'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth/session'

jest.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
jest.mock('@/lib/auth/session', () => ({ getAuthUser: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/auth/requestContext', () => ({ setAuthenticatedDatabaseContext: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))
jest.mock('@/components/ProjectCard', () => ({ __esModule: true, default: ({ project }: { project: { id: string; name: string } }) => <a href={`/project/${project.id}`}>{project.name}</a> }))

beforeEach(() => {
  jest.mocked(getAuthUser).mockResolvedValue({ id: 'owner', name: 'Synthetic surveyor', email: 'synthetic@example.invalid' } as Awaited<ReturnType<typeof getAuthUser>>)
  jest.mocked(db.query).mockResolvedValue({ rows: [{ id: 'project-a', name: 'Synthetic control survey', total_count: '1', point_count: '5', parcel_count: '0' }] } as never)
})

test('Projects opens an owner-scoped project register instead of redirecting back to Dashboard', async () => {
  render(await ProjectsPage({}))
  expect(screen.getByRole('heading', { name: 'Projects', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Synthetic control survey' })).toHaveAttribute('href', '/project/project-a')
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('p.user_id = $1'), expect.arrayContaining(['owner']))
})

test('a failed register read keeps a visible retry and never invents an empty workspace', async () => {
  jest.mocked(db.query).mockRejectedValue(new Error('Synthetic database failure'))
  render(await ProjectsPage({}))
  expect(screen.getByRole('alert')).toHaveTextContent('Projects could not be loaded')
  expect(screen.getByRole('link', { name: 'Retry projects' })).toHaveAttribute('href', '/projects')
  expect(screen.queryByText('No projects yet')).not.toBeInTheDocument()
})

test('anonymous users sign in with the Projects destination retained', async () => {
  jest.mocked(getAuthUser).mockResolvedValue(null)
  await expect(ProjectsPage({})).rejects.toThrow('REDIRECT:/login?next=%2Fprojects')
})
