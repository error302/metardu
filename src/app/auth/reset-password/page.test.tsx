import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ResetPasswordPage from './page'
let mockParams = new URLSearchParams()
jest.mock('next/navigation', () => ({ useSearchParams: () => mockParams, useRouter: () => ({ push: jest.fn() }) }))
const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })
it('offers a direct new-link action when the reset token is missing', () => {
  mockParams = new URLSearchParams('next=%2Ffieldbook')
  render(<ResetPasswordPage />)
  expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveAttribute('href', '/login?recovery=1&next=%2Ffieldbook')
})
it('shows the committed result and email-delivery status before the user returns to sign in', async () => {
  mockParams = new URLSearchParams('token=synthetic-test-token&next=%2Ffieldbook')
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, confirmationEmailSent: false }) })
  render(<ResetPasswordPage />)
  fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'Synthetic-test-password' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Synthetic-test-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update Password' }))
  await waitFor(() => expect(screen.getByText('Password updated')).toBeInTheDocument())
  expect(screen.getByText(/confirmation email could not be sent/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Sign in with your new password' })).toHaveAttribute('href', '/login?reset=success&next=%2Ffieldbook')
})
