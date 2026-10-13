import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import EarthworksCalculator from '../CrossSectionInput'

jest.mock('@/components/shared/PrintMetaPanel', () => ({ PrintMetaPanel: () => null }))

it('blocks empty observations, preserves unknown shoulder/material inputs and explains the missing measurements', () => {
  render(<EarthworksCalculator />)
  expect(screen.getByLabelText('Shoulder Crossfall (%)')).toHaveValue(null)
  expect(screen.getByLabelText('Material Conversion Factor (optional)')).toHaveValue(null)
  fireEvent.click(screen.getByRole('button', { name: 'Compute All' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/Ground RL.*complete finite decimal/i)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Print BoQ/ })).not.toBeInTheDocument()
})

it('invalidates computed quantities and drawings when the approved template changes', () => {
  const { container } = render(<EarthworksCalculator />)
  fireEvent.change(screen.getByLabelText('Shoulder Width (m)'), { target: { value: '0' } })
  const inputs = container.querySelectorAll('tbody input')
  // km, metres, CL RL, formation RL, then four left and four right pairs.
  for (const [index, value] of [[2, '1'], [3, '0'], [4, '10'], [5, '1'], [12, '10'], [13, '1']] as const) {
    fireEvent.change(inputs[index], { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Compute All' }))
  expect(screen.getByRole('img', { name: /Observed earthworks/ })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Camber (%)'), { target: { value: '3' } })
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Print BoQ/ })).not.toBeInTheDocument()
})
