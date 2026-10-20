import ProjectMapPage from './page'
import { redirect } from 'next/navigation'

jest.mock('next/navigation', () => ({ redirect: jest.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }) }))

it('opens the shared capture map with project context instead of requiring existing coordinates', async () => {
  await expect(ProjectMapPage({ params: Promise.resolve({ id: 'synthetic-project' }) })).rejects.toThrow('REDIRECT:/map?projectId=synthetic-project')
  expect(redirect).toHaveBeenCalledWith('/map?projectId=synthetic-project')
})
