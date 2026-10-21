import { render, screen } from '@testing-library/react'
import SupportPage from '@/app/support/page'

const originalContact = process.env.SUPPORT_EMAIL
afterEach(() => {
  if (originalContact === undefined) delete process.env.SUPPORT_EMAIL
  else process.env.SUPPORT_EMAIL = originalContact
})

test('support uses the deployment contact rather than a hardcoded domain', () => {
  process.env.SUPPORT_EMAIL = 'help@example.test'
  render(<SupportPage />)
  expect(screen.getByRole('link', { name: 'Email help@example.test' })).toHaveAttribute('href', 'mailto:help@example.test')
})

test.each([undefined, 'invalid?bcc=someone@example.test'])('missing or invalid contact is visible without inventing a destination (%s)', contact => {
  if (contact === undefined) delete process.env.SUPPORT_EMAIL
  else process.env.SUPPORT_EMAIL = contact
  render(<SupportPage />)
  expect(screen.getByRole('status')).toHaveTextContent('Support email is not configured')
  expect(screen.queryByRole('link', { name: /^Email / })).toBeNull()
  expect(screen.getByRole('link', { name: 'Help and workflow guidance' })).toHaveAttribute('href', '/help')
})
