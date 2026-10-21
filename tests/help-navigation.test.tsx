import { fireEvent, render, screen } from '@testing-library/react'
import HelpPage from '@/app/help/page'

test('an open answer remains attached to its question when help is filtered', () => {
  render(<HelpPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Can I connect my GNSS rover directly to METARDU?' }))
  expect(screen.getByText(/Web Bluetooth/)).toBeVisible()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search for help...' }), { target: { value: 'GNSS rover' } })
  expect(screen.getByText(/Web Bluetooth/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Can I connect my GNSS rover directly to METARDU?' })).toHaveAttribute('aria-expanded', 'true')
  fireEvent.change(screen.getByRole('textbox', { name: 'Search for help...' }), { target: { value: '' } })
  expect(screen.getByRole('button', { name: 'How do I create my first survey project?' })).toHaveAttribute('aria-expanded', 'false')
})
