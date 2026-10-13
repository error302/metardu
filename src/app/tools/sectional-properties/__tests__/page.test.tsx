import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import SectionalPropertiesPage from '../page'
jest.mock('@/components/shared/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }))

it('starts without fictional cadastral records and blocks incomplete measurements', () => {
  render(<SectionalPropertiesPage />)
  expect(screen.getByLabelText('Building Name')).toHaveValue('')
  expect(screen.getByLabelText('LR Number')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Prepare area schedule' }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
})

it('uses an explicit measured floor total and clears stale area schedules on input changes', () => {
  render(<SectionalPropertiesPage />)
  fireEvent.change(screen.getByLabelText('Building Name'), { target: { value: 'Measured building' } })
  fireEvent.change(screen.getByLabelText('LR Number'), { target: { value: 'Survey source reference' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Add Unit' }))
  fireEvent.change(screen.getByLabelText('Unit 1 number'), { target: { value: 'A1' } })
  fireEvent.change(screen.getByLabelText('Unit 1 floor'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Unit 1 type'), { target: { value: 'residential' } })
  fireEvent.change(screen.getByLabelText('Unit 1 area (m²)'), { target: { value: '80' } })
  fireEvent.change(screen.getByLabelText('Measured total area of floor 0 (m²)'), { target: { value: '80' } })
  fireEvent.click(screen.getByRole('button', { name: 'Prepare area schedule' }))
  expect(screen.getByLabelText('Non-unit floor area')).toHaveTextContent('0.000')
  expect(screen.getByRole('button', { name: 'Download area schedule CSV' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Unit 1 area (m²)'), { target: { value: '' } })
  expect(screen.queryByRole('button', { name: 'Download area schedule CSV' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Prepare area schedule' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/complete finite|measured area/i)
})
