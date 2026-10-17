import React from 'react'
import { render, screen } from '@testing-library/react'
import SubscriptionStatus from './SubscriptionStatus'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

it('renders a stable trial label while the dashboard owns the dated reminder', () => {
  render(
    <SubscriptionStatus
      subscription={{ plan_id: 'pro', status: 'trial', trial_ends_at: '2026-10-18T00:00:00.000Z' }}
    />,
  )

  expect(screen.getByText('Pro Trial')).toBeInTheDocument()
  expect(screen.queryByText(/days left/i)).not.toBeInTheDocument()
})
