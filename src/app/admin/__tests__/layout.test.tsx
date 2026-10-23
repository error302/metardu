import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import AppShell from '@/components/layout/AppShell'
import AdminLayout from '../layout'

jest.mock('next/navigation', () => ({ usePathname: () => '/admin', useRouter: () => ({ push: jest.fn() }) }))
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { role: 'super_admin' } } }) }))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('@/components/NavBar', () => () => null)
jest.mock('@/components/Footer', () => () => null)
jest.mock('@/components/layout/ProjectionInit', () => ({ ProjectionInit: () => null }))
jest.mock('@/components/app/OfflineIndicator', () => ({ OfflineIndicator: () => null }))
jest.mock('@/components/chatgpt/NoticeBanner', () => ({ ChatGPTNoticeBanner: () => null }))
jest.mock('@/lib/i18n/LanguageContext', () => ({ LanguageProvider: ({ children }: { children: ReactNode }) => children, useLanguage: () => ({ t: (key: string) => key }) }))
jest.mock('@/lib/country', () => ({ CountryProvider: ({ children }: { children: ReactNode }) => children }))
jest.mock('@/lib/subscription/subscriptionContext', () => ({ SubscriptionProvider: ({ children }: { children: ReactNode }) => children }))

const originalFetch = global.fetch
beforeEach(() => {
  localStorage.setItem('metardu:theme', 'dark')
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { notifications: [], unreadCount: 0 } }) })
})
afterEach(() => { global.fetch = originalFetch })

it('keeps one display control in the admin header instead of adding a floating duplicate', () => {
  render(<AppShell><AdminLayout><p>Business content</p></AdminLayout></AppShell>)
  const header = screen.getByRole('banner')
  const controls = screen.getAllByRole('button', { name: /Theme:|fieldMode\.switchTo/ })
  expect(controls).toHaveLength(1)
  expect(within(header).getByRole('button', { name: /Theme:/ })).toBe(controls[0])
  expect(within(header).getByRole('link', { name: /Back to app/ })).toHaveAttribute('href', '/dashboard')
})
