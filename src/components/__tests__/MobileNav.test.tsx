import { fireEvent, render, screen } from '@testing-library/react'
import { usePathname } from 'next/navigation'
import MobileNav from '../MobileNav'

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }))
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }))

const mockUsePathname = jest.mocked(usePathname)

beforeEach(() => mockUsePathname.mockReturnValue('/map'))

it('keeps map, field book, CAD and tools in the compact primary dock', () => {
  render(<MobileNav />)

  const navigation = screen.getByRole('navigation', { name: 'Primary mobile navigation' })
  expect(navigation).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Field Book' })).toHaveAttribute('href', '/fieldbook')
  expect(screen.getByRole('link', { name: 'CAD editor' })).toHaveAttribute('href', '/tools/cad-editor')
  expect(screen.getByRole('link', { name: 'Tools' })).toHaveAttribute('href', '/tools')
  expect(screen.queryByRole('link', { name: 'Marketplace' })).not.toBeInTheDocument()
})

it('opens the More drawer, rotates its control, and keeps secondary destinations reachable', () => {
  render(<MobileNav />)

  const more = screen.getByRole('button', { name: 'Show more navigation options' })
  fireEvent.click(more)

  expect(more).toHaveAttribute('aria-expanded', 'true')
  expect(more.querySelector('svg')).toHaveClass('rotate-90')
  expect(screen.getByRole('dialog', { name: 'More navigation options' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/dashboard')
  expect(screen.getByRole('link', { name: /Marketplace/ })).toHaveAttribute('href', '/marketplace')

  fireEvent.click(screen.getByRole('button', { name: 'Close more navigation' }))
  expect(more).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('dialog', { name: 'More navigation options' })).not.toBeInTheDocument()
})
