import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import LoginPage from './page'
const mockSignIn = jest.fn<Promise<unknown>, unknown[]>()
let mockParams = new URLSearchParams()
jest.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => mockSignIn(...args), getProviders: async () => ({}) }))
jest.mock('next/navigation', () => ({ useSearchParams: () => mockParams }))
jest.mock('next/image', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/MetarduLogo', () => ({ __esModule: true, default: () => null }))

const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })
beforeEach(() => { mockParams = new URLSearchParams(); mockSignIn.mockReset(); localStorage.clear() })
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
