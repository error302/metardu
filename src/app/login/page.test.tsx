import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import LoginPage from './page'
const mockSignIn = jest.fn<Promise<unknown>, unknown[]>()
let mockParams = new URLSearchParams()
let mockProviders: Record<string, { id: string; name: string; type: string }> = {}
jest.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => mockSignIn(...args), getProviders: async () => mockProviders }))
jest.mock('next/navigation', () => ({ useSearchParams: () => mockParams }))
jest.mock('next/image', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/MetarduLogo', () => ({ __esModule: true, default: () => null }))

const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })
beforeEach(() => { mockParams = new URLSearchParams(); mockProviders = {}; mockSignIn.mockReset(); localStorage.clear() })
it('opens recovery directly from a request-new-link URL', async () => {
  mockParams = new URLSearchParams('recovery=1&next=%2Ffieldbook')
  render(<LoginPage />)
  expect(await screen.findByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument()
})
it('shows the server recovery error instead of claiming the email was sent', async () => {
  mockParams = new URLSearchParams('recovery=1')
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Password recovery is temporarily unavailable. Please try again later.' }) })
  render(<LoginPage />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'crew@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Password recovery is temporarily unavailable'))
  expect(screen.queryByText('Check your email')).not.toBeInTheDocument()
})

it('shows configured Google sign-in and preserves the requested workspace destination', async () => {
  mockProviders = { google: { id: 'google', name: 'Google', type: 'oauth' } }
  mockParams = new URLSearchParams('next=%2Fadmin')
  mockSignIn.mockResolvedValue(undefined)
  render(<LoginPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('google', expect.objectContaining({ callbackUrl: '/admin' })))
})
it('does not advertise Google when this runtime has no configured provider', async () => {
  render(<LoginPage />)
  await waitFor(() => expect(screen.getByRole('button', { name: /^Sign In$/ })).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
})
