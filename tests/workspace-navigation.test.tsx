import { fireEvent, render, screen } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import NavBar from '@/components/NavBar'

jest.mock('next-auth/react', () => ({ useSession: jest.fn(), signOut: jest.fn() }))
jest.mock('next/navigation', () => ({ usePathname: jest.fn(), useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))
jest.mock('@/lib/i18n/LanguageContext', () => ({ languages: [{ code: 'en', flag: 'EN', name: 'English' }], useLanguage: () => ({ language: 'en', setLanguage: jest.fn(), t: (key: string) => key }) }))
jest.mock('@/lib/api/client', () => ({ apiGet: jest.fn(), apiPost: jest.fn(), ApiError: class extends Error {} }))
jest.mock('@/components/shared/FieldModeToggle', () => ({ __esModule: true, default: () => <button>Display theme</button> }))
jest.mock('@/components/SubscriptionBadge', () => ({ __esModule: true, default: () => <span>Free</span> }))

beforeEach(() => {
  jest.mocked(usePathname).mockReturnValue('/')
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'loading', update: jest.fn() })
})

test('landing navigation always provides a dashboard entry while authentication is loading', () => {
  render(<NavBar />)
  expect(screen.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', '/dashboard')
})

test('returning users can enter work mode directly from the landing page', () => {
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'synthetic', name: 'Surveyor', email: 'surveyor@example.invalid' }, expires: '2099-01-01' }, status: 'authenticated', update: jest.fn() })
  render(<NavBar />)
  expect(screen.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', '/dashboard')
})

test('public product pages retain a direct route into the dashboard', () => {
  jest.mocked(usePathname).mockReturnValue('/pricing')
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update: jest.fn() })
  render(<NavBar />)
  expect(screen.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', '/dashboard')
})

test('work pages keep the compact grouped header while authentication is loading', () => {
  jest.mocked(usePathname).mockReturnValue('/projects')
  render(<NavBar />)
  expect(screen.getByRole('button', { name: /^Field$/ })).toBeInTheDocument()
})

test.each(['admin', 'super_admin', 'org_admin', 'surveyor'])('work menu follows platform administration scope for %s', role => {
  jest.mocked(usePathname).mockReturnValue('/dashboard')
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'synthetic', email: 'surveyor@example.invalid', role }, expires: '2099-01-01' }, status: 'authenticated', update: jest.fn() })
  render(<NavBar />)
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
  expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en')
  const administration = screen.queryByRole('link', { name: 'Admin Dashboard' })
  if (role === 'admin' || role === 'super_admin') expect(administration).toHaveAttribute('href', '/admin')
  else expect(administration).not.toBeInTheDocument()
})
