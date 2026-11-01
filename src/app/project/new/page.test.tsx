import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import NewProjectPage from './page'

let mockDefaultCountry: 'kenya' | 'uae' = 'kenya'
let mockSession: { user?: { name?: string | null } } | null = null
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: mockSession }) }))

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/country', () => ({
  useCountry: () => ({ country: mockDefaultCountry, setCountry: jest.fn() }),
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
    fireEvent.click(screen.getByRole('button', { name: 'Site sketch (optional)' }))
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


describe('new project repeated details', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch; mockSession = null })

  it('prefills the account name without overwriting an edit or an intentional blank', () => {
    mockSession = { user: { name: 'Recorded QA Surveyor' } }
    const view = render(<NewProjectPage />)
    expect(screen.getByLabelText('Surveyor Name')).toHaveValue('Recorded QA Surveyor')
    fireEvent.change(screen.getByLabelText('Surveyor Name'), { target: { value: 'Assigned QA colleague' } })
    mockSession = { user: { name: 'Refreshed profile name' } }; view.rerender(<NewProjectPage />)
    expect(screen.getByLabelText('Surveyor Name')).toHaveValue('Assigned QA colleague')
    fireEvent.change(screen.getByLabelText('Surveyor Name'), { target: { value: '' } }); view.rerender(<NewProjectPage />)
    expect(screen.getByLabelText('Surveyor Name')).toHaveValue('')
  })

  it('offers previous client names on demand without copying the prior project reference', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [
      { client_name: 'Synthetic client A', datum: 'Arc1960', utm_zone: 37 },
      { client_name: ' synthetic client a ' }, { client_name: 'Synthetic client B' }, { client_name: null },
    ] }) })
    global.fetch = fetchMock
    render(<NewProjectPage />)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.focus(screen.getByLabelText('Client Name'))
    await waitFor(() => expect(screen.getByRole('option', { name: 'Synthetic client A', hidden: true })).toBeInTheDocument())
    expect(screen.getByLabelText('Client Name')).toHaveAttribute('list', 'recent-project-clients')
    expect(screen.getAllByRole('option', { hidden: true }).filter(option => option.parentElement?.id === 'recent-project-clients')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Client Name'), { target: { value: 'Synthetic client B' } })
    expect(screen.getByLabelText('Client Name')).toHaveValue('Synthetic client B')
    expect(screen.getByLabelText('Horizontal reference')).toHaveValue('')
    expect(screen.getByLabelText('UTM Zone (1–60)')).toHaveDisplayValue('')
    expect(fetchMock).toHaveBeenCalledWith('/api/projects?limit=50', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }))
    const [, request] = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]
    expect(request.signal).toBeInstanceOf(AbortSignal)
  })

  it('keeps manual client entry available after suggestions fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'))
    render(<NewProjectPage />)
    fireEvent.focus(screen.getByLabelText('Client Name'))
    await screen.findByText('Previous clients are unavailable. You can still enter a client name.')
    fireEvent.change(screen.getByLabelText('Client Name'), { target: { value: 'New synthetic client' } })
    expect(screen.getByLabelText('Client Name')).toHaveValue('New synthetic client')
  })

  it('keeps the site sketch optional and avoids mounting its map until requested', () => {
    render(<NewProjectPage />)
    const toggle = screen.getByRole('button', { name: 'Site sketch (optional)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Draw synthetic location sketch' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Draw synthetic location sketch' })).toBeVisible()
  })
})


test('loads the saved jurisdiction without replacing a user choice or inferring survey references',()=>{
 mockDefaultCountry='kenya'
 const view=render(<NewProjectPage />)
 mockDefaultCountry='uae';view.rerender(<NewProjectPage />)
 expect(screen.getByLabelText('Country / Jurisdiction')).toHaveValue('uae')
 fireEvent.change(screen.getByLabelText('Country / Jurisdiction'),{target:{value:'kenya'}})
 view.rerender(<NewProjectPage />)
 expect(screen.getByLabelText('Country / Jurisdiction')).toHaveValue('kenya')
 expect(screen.getByLabelText('Horizontal reference')).toHaveValue('')
 expect(screen.getByLabelText('UTM Zone (1–60)')).toHaveDisplayValue('')
 mockDefaultCountry='kenya'
})
