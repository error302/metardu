import { fireEvent, render, screen } from '@testing-library/react'
import { FieldbookSessionHeader } from './FieldbookSessionHeader'
import { EMPTY_FIELDBOOK_SESSION, type FieldbookSession } from '@/app/fieldbook/types'

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
    /Serial number/, /Calibration date/, /Calibration reference/, /Units/, /CRS \/ survey grid/,
  ]) {
    expect(screen.getByLabelText(label)).toBeInTheDocument()
  }

  fireEvent.change(screen.getByLabelText(/Party \/ crew/), { target: { value: 'Otieno crew' } })
  expect(onChange).toHaveBeenCalledWith({ party: 'Otieno crew' })

  fireEvent.change(screen.getByLabelText(/Units/), { target: { value: 'feet' } })
  expect(onChange).toHaveBeenCalledWith({ units: 'feet' })

  fireEvent.change(screen.getByLabelText(/Serial number/), { target: { value: 'SN-8841' } })
  expect(onChange).toHaveBeenCalledWith({ instrumentSerial: 'SN-8841' })
})

test('header states it is a record of conditions, not a certification', () => {
  render(<FieldbookSessionHeader session={session} onChange={jest.fn()} />)
  expect(screen.getByText(/not a\s+certification of accuracy/)).toBeInTheDocument()
})
