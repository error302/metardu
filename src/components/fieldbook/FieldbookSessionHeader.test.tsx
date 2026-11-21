import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FieldbookSessionHeader } from './FieldbookSessionHeader'
import { EMPTY_FIELDBOOK_SESSION, type FieldbookSession } from '@/app/fieldbook/types'
import { buildProjectReferenceSystem, horizontalCrsFor } from '@/lib/spatial/projectReferenceSystem'

// CRS codes derive from the declaration authority — never hardcoded literals.
const ARC_1960_37S = horizontalCrsFor('ARC1960', 37, 'S')
const ARC_1960_36S = horizontalCrsFor('ARC1960', 36, 'S')

const declaredRecord = {
  prs: buildProjectReferenceSystem({ datum: 'ARC1960', utmZone: 37, hemisphere: 'S' }),
}

const session: FieldbookSession = {
  ...EMPTY_FIELDBOOK_SESSION,
  date: '2026-11-19',
  party: 'Mohamed + Achieng',
  instrumentMake: 'Leica',
  instrumentModel: 'TS16',
  crs: 'EPSG:32737',
}

test('summary line reflects the recorded session without opening the header', () => {
  render(<FieldbookSessionHeader session={session} onChange={jest.fn()} />)
  expect(screen.getByText(/Date 2026-11-19/)).toBeInTheDocument()
  expect(screen.getByText(/Mohamed \+ Achieng/)).toBeInTheDocument()
  expect(screen.getByText(/Leica TS16/)).toBeInTheDocument()
  expect(screen.getByText(/CRS EPSG:32737/)).toBeInTheDocument()
})

test('every required session field is present and edits emit patches', () => {
  const onChange = jest.fn()
  render(<FieldbookSessionHeader session={session} onChange={onChange} />)

  for (const label of [
    /Date/, /Party \/ crew/, /Weather/, /Instrument make/, /Instrument model/,
    /Serial number/, /Calibration date/, /Calibration reference/, /Units/,
  ]) {
    expect(screen.getByLabelText(label)).toBeInTheDocument()
  }
  // Exact match: the picker's filter box shares a longer label.
  expect(screen.getByLabelText('CRS / survey grid')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/Party \/ crew/), { target: { value: 'Otieno crew' } })
  expect(onChange).toHaveBeenCalledWith({ party: 'Otieno crew' })

  fireEvent.change(screen.getByLabelText(/Units/), { target: { value: 'feet' } })
  expect(onChange).toHaveBeenCalledWith({ units: 'feet' })

  fireEvent.change(screen.getByLabelText(/Serial number/), { target: { value: 'SN-8841' } })
  expect(onChange).toHaveBeenCalledWith({ instrumentSerial: 'SN-8841' })

  // The CRS is selected from the registry, never typed: the label attaches
  // to a select, and choosing a code emits the canonical value.
  fireEvent.change(screen.getByLabelText('CRS / survey grid'), { target: { value: ARC_1960_37S } })
  expect(onChange).toHaveBeenCalledWith({ crs: ARC_1960_37S })
})

test('header states it is a record of conditions, not a certification', () => {
  render(<FieldbookSessionHeader session={session} onChange={jest.fn()} />)
  expect(screen.getByText(/not a\s+certification of accuracy/)).toBeInTheDocument()
})

describe('project reference auto-apply', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { referenceSystem: declaredRecord, referenceHash: 'a'.repeat(64) } }),
    }) as unknown as typeof fetch
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('an empty session CRS receives the declared project grid, with provenance', async () => {
    const onChange = jest.fn()
    render(<FieldbookSessionHeader session={{ ...EMPTY_FIELDBOOK_SESSION, crs: '' }} onChange={onChange} projectId="p1" />)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ crs: ARC_1960_37S }))

    render(<FieldbookSessionHeader session={{ ...EMPTY_FIELDBOOK_SESSION, crs: ARC_1960_37S }} onChange={jest.fn()} projectId="p1" />)
    await waitFor(() => expect(screen.getByTestId('fieldbook-session-crs-provenance').textContent).toMatch(/Auto-applied from the project/))
  })

  test('a value the surveyor picked is never overwritten by the auto-apply', async () => {
    const onChange = jest.fn()
    render(<FieldbookSessionHeader session={{ ...EMPTY_FIELDBOOK_SESSION, crs: '' }} onChange={onChange} projectId="p1" />)
    // The surveyor picks before the declaration request resolves.
    fireEvent.change(screen.getByLabelText('CRS / survey grid'), { target: { value: ARC_1960_36S } })
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onChange).toHaveBeenCalledWith({ crs: ARC_1960_36S })
    expect(onChange).not.toHaveBeenCalledWith({ crs: ARC_1960_37S })
  })

  test('without a project there is no fetch and no auto-apply', () => {
    const onChange = jest.fn()
    render(<FieldbookSessionHeader session={{ ...EMPTY_FIELDBOOK_SESSION, crs: '' }} onChange={onChange} />)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })
})
