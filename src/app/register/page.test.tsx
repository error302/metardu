import { fireEvent, render, screen } from '@testing-library/react'
import RegisterPage from './page'

const mockSignIn = jest.fn<Promise<unknown>, unknown[]>()
jest.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }))
const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })

it('keeps a committed account successful when automatic sign-in fails', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, onboardingComplete: true, verificationEmailSent: false }) })
  mockSignIn.mockRejectedValueOnce(new Error('connection lost'))
  render(<RegisterPage />)
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Road Crew' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'crew@example.com' } })
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'test-password-123' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'test-password-123' } })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: /create account/i }))
  expect(await screen.findByText('Account created!')).toBeInTheDocument()
  expect(screen.getByText(/verification email could not be sent/)).toBeInTheDocument()
  expect(screen.queryByText('Registration failed. Please try again.')).not.toBeInTheDocument()
})
