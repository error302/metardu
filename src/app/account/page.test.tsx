import { act, render, screen } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import Page from './page'
jest.mock('next-auth/react', () => ({ useSession: jest.fn(), signOut: jest.fn() }))
const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
const account = (id: string): ReturnType<typeof useSession> => ({ data: { user: { id, email: `${id}@example.invalid` }, expires: '2099-01-01' }, status: 'authenticated', update: jest.fn(async () => null) })
const reply = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) }) as Response
const subscription = { plan: 'pro', status: 'active', trialEndsAt: null, periodEnd: '2099-01-01T00:00:00.000Z' }
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(reply(subscription))
  global.fetch = fetchMock
  jest.mocked(useSession).mockReturnValue(account('first-owner'))
})
test('normal paid subscriptions accept a null trial date and never fabricate a renewal', async () => {
  render(<Page />)
  expect(await screen.findByText('pro Plan')).toBeInTheDocument()
  expect(screen.getByText(/Current period ends/)).toBeInTheDocument()
  expect(screen.queryByText(/Renews/)).not.toBeInTheDocument()
})
test('failed subscription reads are visible instead of claiming there is no subscription', async () => {
  fetchMock.mockRejectedValue(new TypeError('Synthetic offline'))
  render(<Page />)
  expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load.*subscription/i)
  expect(screen.queryByText('No active subscription')).not.toBeInTheDocument()
})
test('password changes retain the current-password and confirmation requirements',async()=>{
  render(<Page />)
  expect(await screen.findByLabelText('Current Password')).toBeInTheDocument()
  expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument()
  expect(screen.getByLabelText('New Password')).toHaveAttribute('minlength','8')
})
test('late subscription reads cannot attach to the next signed-in account', async () => {
  let finish: (value: Response) => void = () => undefined
  const pending = new Promise<Response>(resolve => { finish = resolve })
  fetchMock.mockReturnValueOnce(pending)
  const view = render(<Page />)
  jest.mocked(useSession).mockReturnValue(account('second-owner'))
  fetchMock.mockResolvedValue(reply({ plan: 'free', status: 'active' }))
  view.rerender(<Page />)
  await screen.findByText('free Plan')
  await act(async () => { finish(reply(subscription)); await pending })
  expect(screen.queryByText('pro Plan')).not.toBeInTheDocument()
})
