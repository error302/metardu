import { fireEvent, render, screen } from '@testing-library/react'
import { CommandPalette } from './CommandPalette'

const mockPush = jest.fn<void, [string]>()
const mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>()
const originalFetch = global.fetch
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/lib/performance', () => ({ useDebounceValue: (value: string) => value }))

beforeEach(() => {
  mockPush.mockReset()
  mockFetch.mockReset()
  global.fetch = mockFetch
  HTMLElement.prototype.scrollIntoView = jest.fn()
})
afterEach(() => { global.fetch = originalFetch })

it('opens an API project result from the current grouped search contract', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ query: 'ridge', total: 1, results: [
    { type: 'projects', total: 1, hits: [{ id: 'p1', title: 'Ridge field survey', type: 'projects', score: 1 }] },
  ] }) } as Response)
  render(<CommandPalette />)
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ridge' } })
  fireEvent.click(await screen.findByRole('button', { name: /Ridge field survey/ }))
  expect(mockPush).toHaveBeenCalledWith('/project/p1')
})

it('explains record-search failure while preserving page shortcuts', async () => {
  mockFetch.mockResolvedValue({ ok: false } as Response)
  render(<CommandPalette />)
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'map' } })
  expect(await screen.findByRole('status')).toHaveTextContent('Record search is temporarily unavailable')
  fireEvent.click(screen.getByRole('button', { name: /Map Global survey map/ }))
  expect(mockPush).toHaveBeenCalledWith('/map')
})
