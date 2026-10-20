import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import NewProjectPage from './page'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/country', () => ({
  useCountry: () => ({ country: 'kenya', setCountry: jest.fn() }),
  ALL_COUNTRIES: [{ id: 'kenya', name: 'Kenya', flag: '' }, { id: 'uae', name: 'UAE', flag: '' }],
}))
jest.mock('@/components/shared/OnboardingChecklist', () => ({ markOnboardingStepComplete: jest.fn() }))
jest.mock('@/components/project/BoundarySelectorMap', () => ({
  BoundarySelectorMap: ({ onBoundaryChange }: { onBoundaryChange: (coordinates: number[][], area: number, center: [number, number]) => void }) =>
    <button type="button" onClick={() => onBoundaryChange([[3, 1], [3.01, 1], [3, 1.01], [3, 1]], 100, [3, 1])}>Draw synthetic location sketch</button>,
}))

describe('new project reference choices', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('does not infer a datum or zone from country', () => {
    render(<NewProjectPage />)
    expect(screen.getByLabelText('Horizontal reference')).toHaveValue('')
    expect(screen.getByLabelText('UTM Zone (1–60)')).toHaveDisplayValue('')
    fireEvent.change(screen.getByLabelText('Country / Jurisdiction'), { target: { value: 'uae' } })
    expect(screen.getByLabelText('Horizontal reference')).toHaveValue('')
    expect(screen.getByLabelText('UTM Zone (1–60)')).toHaveDisplayValue('')
  })

  it('keeps an entered reference when a location sketch suggests another zone', () => {
    render(<NewProjectPage />)
    fireEvent.change(screen.getByLabelText('Horizontal reference'), { target: { value: 'WGS84' } })
    fireEvent.change(screen.getByLabelText('UTM Zone (1–60)'), { target: { value: '37' } })
    fireEvent.click(screen.getByRole('button', { name: /Southern/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Draw synthetic location sketch' }))
    expect(screen.getByLabelText('UTM Zone (1–60)')).toHaveValue(37)
    expect(screen.getByRole('button', { name: /Southern/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/location suggests UTM 31N/)).toBeInTheDocument()
  })

  it('can prepare a project with an honestly unset reference', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'synthetic-project' } }) })
    global.fetch = fetchMock
    render(<NewProjectPage />)
    fireEvent.change(screen.getByLabelText(/Project Name/), { target: { value: 'Synthetic unknown reference' } })
    fireEvent.click(screen.getByRole('button', { name: /^Create Project$/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const options = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0][1]
    expect(JSON.parse(options.body as string)).toMatchObject({ datum: null, utm_zone: null, hemisphere: null })
  })
})
