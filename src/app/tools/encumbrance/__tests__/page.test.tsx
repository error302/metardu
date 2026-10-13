import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import EncumbrancePage from '../page'
jest.mock('@/components/shared/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }))
const fixtureCrs = 'EPSG:32737'

it('starts without fictional records, parcel areas or registration dates', async () => {
  render(<EncumbrancePage />)
  expect(screen.getByLabelText('Source parcel area (m², optional)')).toHaveValue(null)
  expect(screen.queryByDisplayValue('Kenya Power')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Assess supplied records' }))
  await waitFor(() => expect(screen.getByLabelText('Complete supplied-record coverage')).toHaveTextContent('Not assessed'))
  expect(screen.getByText(/not a registry search/i)).toBeInTheDocument()
})
const fill = () => {
  fireEvent.change(screen.getByLabelText('Declared projected CRS'), { target: { value: fixtureCrs } })
  fireEvent.change(screen.getByLabelText('Parcel boundary coordinates'), { target: { value: '500000,9799950\n500100,9799950\n500100,9800050\n500000,9800050' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Add record' }))
  fireEvent.change(screen.getByLabelText('Record 1 type'), { target: { value: 'wayleave' } })
  fireEvent.change(screen.getByLabelText('Record 1 geometry'), { target: { value: 'centreline' } })
  fireEvent.change(screen.getByLabelText('Record 1 full corridor width (m)'), { target: { value: '10' } })
  fireEvent.change(screen.getByLabelText('Record 1 coordinates'), { target: { value: '499950,9800000\n500150,9800000' } })
  fireEvent.click(screen.getByLabelText('Use butt ends and bevel joins'))
}
it('computes clipped coverage, preserves unknown dates and invalidates stale exports', async () => {
  render(<EncumbrancePage />); fill()
  expect(screen.getByLabelText('Record 1 source registration date')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Assess supplied records' }))
  await waitFor(() => expect(screen.getByLabelText('Complete supplied-record coverage')).toHaveTextContent('1000.000'))
  expect(screen.getByRole('img', { name: /Parcel and assessed encumbrance coverage/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Download coverage DXF' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Record 1 full corridor width (m)'), { target: { value: '' } })
  expect(screen.queryByRole('button', { name: 'Download coverage DXF' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Assess supplied records' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/width/i))
})
it('rejects a partial coordinate row without silently moving it to zero', async () => {
  render(<EncumbrancePage />); fill()
  fireEvent.change(screen.getByLabelText('Record 1 coordinates'), { target: { value: '499950,\n500150,9800000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Assess supplied records' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/row 1.*complete finite/i))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
it('does not publish an outdated calculation after the inputs change during module loading', async () => {
  render(<EncumbrancePage />); fill()
  fireEvent.click(screen.getByRole('button', { name: 'Assess supplied records' }))
  fireEvent.change(screen.getByLabelText('Record 1 full corridor width (m)'), { target: { value: '20' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Assess supplied records' })).toBeEnabled())
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Assess supplied records' }))
  await waitFor(() => expect(screen.getByLabelText('Complete supplied-record coverage')).toHaveTextContent('2000.000'))
})
