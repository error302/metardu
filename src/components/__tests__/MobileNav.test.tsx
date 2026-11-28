import { fireEvent, render, screen, within } from '@testing-library/react'
import { usePathname } from 'next/navigation'
import MobileNav from '../MobileNav'

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }))

const mockUsePathname = jest.mocked(usePathname)
beforeEach(() => {
  mockUsePathname.mockReturnValue('/map')
  window.matchMedia = jest.fn().mockReturnValue({ addEventListener: jest.fn(), removeEventListener: jest.fn() })
})

it('keeps field actions and the schedule in fixed positions across routes', () => {
  const { rerender } = render(<MobileNav />)
  const dock = within(screen.getByRole('navigation', { name: 'Primary mobile navigation' }))
  const labels = ['Collect', 'Set out', 'Map', 'Schedule']
  expect(dock.getAllByRole('link').map(link => link.textContent)).toEqual(labels)
  expect(dock.getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'page')

  mockUsePathname.mockReturnValue('/schedule')
  rerender(<MobileNav />)
  expect(dock.getAllByRole('link').map(link => link.textContent)).toEqual(labels)
  expect(dock.getByRole('link', { name: 'Schedule' })).toHaveAttribute('aria-current', 'page')
})

it('keeps the requested field destinations in the More drawer', () => {
  render(<MobileNav />)
  const more = screen.getByRole('button', { name: 'More' })
  fireEvent.click(more)
  const panel = within(screen.getByRole('dialog', { name: 'More' }))
  expect(panel.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual([
    '/fieldbook', '/equipment', '/marketplace', '/beacons', '/field/tools',
  ])
  expect(panel.queryByRole('link', { name: /CAD|Reports|Dashboard/ })).not.toBeInTheDocument()

  fireEvent.click(panel.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument()
})
