import { render, screen } from '@testing-library/react'
import AccountPage from './page'
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { id: 'user-id', email: 'crew@example.com' } } }), signOut: jest.fn() }))
jest.mock('@/lib/api/client', () => ({ apiGet: async () => ({ plan: 'free', status: 'active' }), apiPost: jest.fn(), ApiError: class extends Error {} }))
it('requires the current password and confirmation rather than submitting an impossible password-only request', async () => {
  render(<AccountPage />)
  expect(await screen.findByLabelText('Current Password')).toBeInTheDocument()
  expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument()
  expect(screen.getByLabelText('New Password')).toHaveAttribute('minlength', '8')
})
